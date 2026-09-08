"""Execute generated review SQL in an isolated in-memory SQLite database only."""
import datetime
import json
import pathlib
import sqlite3
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class CostBasisReviewTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(control_id=1, facilitator_fee_cap_microusd=1000,
                        facilitator_fee_basis_updated_at='2026-08-13T02:44:49.432Z',
                        updated_at='2026-08-13T02:44:49.432Z', service_enabled=1,
                        price_microusd=10000, updated_by='unchanged',
                        pay_to='unchanged', network='unchanged', asset='unchanged')
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        fields = ','.join(f'{k} {"INTEGER" if isinstance(v, int) else "TEXT"}' for k, v in self.row.items())
        self.db.execute(f'CREATE TABLE runtime_controls ({fields})')
        self.db.execute(f'INSERT INTO runtime_controls VALUES ({",".join("?" for _ in self.row)})', list(self.row.values()))
        self.db.execute('CREATE TABLE other_data (value TEXT)')
        self.db.execute("INSERT INTO other_data VALUES ('untouched')")

    def tearDown(self):
        self.db.close()

    def evidence(self, checked_at=None):
        return dict(schemaVersion='coinbase-cdp-facilitator-pricing-review/1.0',
                    source='https://docs.cdp.coinbase.com/x402/seller/facilitator',
                    checkedAt=checked_at or (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)).isoformat(),
                    monthlyFreeOnchainTransactions=1000,
                    additionalOnchainTransactionUsd='0.001', paymentVerificationUsd='0',
                    feeCapMicrousd=1000)

    def sql(self, evidence=None, simulated_now=None, row=None):
        payload = json.dumps([row or self.row, evidence or self.evidence(), simulated_now])
        script = """import {reviewCostBasis} from './scripts/avu-cost-basis-review.mjs';
        import fs from 'node:fs';
        const [row, evidence, now] = JSON.parse(fs.readFileSync(0,'utf8'));
        process.stdout.write(reviewCostBasis(row, evidence, now ?? Date.now()));"""
        return subprocess.run(['node', '--input-type=module', '-e', script], input=payload,
                              text=True, capture_output=True, cwd=ROOT)

    def test_only_three_columns_change(self):
        result = self.sql()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertRegex(result.stdout, r'Evidence digest: sha256:[a-f0-9]{64}')
        self.assertEqual(len(self.db.execute(result.stdout).fetchall()), 1)
        after = dict(self.db.execute('SELECT * FROM runtime_controls').fetchone())
        self.assertEqual(after['facilitator_fee_cap_microusd'], 1000)
        self.assertNotEqual(after['facilitator_fee_basis_updated_at'], self.row['facilitator_fee_basis_updated_at'])
        for k in self.row.keys() - {'facilitator_fee_cap_microusd', 'facilitator_fee_basis_updated_at', 'updated_at'}:
            self.assertEqual(after[k], self.row[k], k)
        self.assertEqual(self.db.execute('SELECT value FROM other_data').fetchone()[0], 'untouched')

    def test_concurrent_control_change_refuses_update(self):
        result = self.sql()
        self.db.execute('UPDATE runtime_controls SET service_enabled=0')
        self.assertEqual(self.db.execute(result.stdout).fetchall(), [])
        self.assertEqual(self.db.execute('SELECT facilitator_fee_basis_updated_at FROM runtime_controls').fetchone()[0], self.row['facilitator_fee_basis_updated_at'])

    def test_executing_review_after_expiry_refuses_update(self):
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=2)
        result = self.sql(self.evidence(old.isoformat()), int((old + datetime.timedelta(seconds=10)).timestamp() * 1000))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.db.execute(result.stdout).fetchall(), [])

    def test_invalid_row_and_stale_fee_review_are_rejected(self):
        self.assertNotEqual(self.sql(row={**self.row, 'control_id': 2}).returncode, 0)
        self.assertNotEqual(self.sql(row={**self.row, 'price_microusd': 1000}).returncode, 0)
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=2)
        self.assertNotEqual(self.sql(self.evidence(old.isoformat())).returncode, 0)

    def test_timestamp_alone_and_changed_pricing_are_rejected(self):
        self.assertNotEqual(self.sql('2026-09-06T19:00:00Z').returncode, 0)
        for field, value in [('monthlyFreeOnchainTransactions', 999),
                             ('additionalOnchainTransactionUsd', '0.002'),
                             ('paymentVerificationUsd', '0.001'),
                             ('feeCapMicrousd', 2000),
                             ('source', 'https://example.com/pricing')]:
            evidence = self.evidence()
            evidence[field] = value
            self.assertNotEqual(self.sql(evidence).returncode, 0, field)


if __name__ == '__main__':
    unittest.main()
