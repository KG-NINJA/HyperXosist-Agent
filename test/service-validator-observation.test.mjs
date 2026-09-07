import test from 'node:test';
import assert from 'node:assert/strict';
import {getOffer} from '../service-receipts.mjs';
import {validValidation,evaluateRoute} from '../scripts/services-readiness.mjs';
const base={valid:true,statusCode:402,x402Version:2,simulation:{outcome:'accepted'},index:{active:true},preflight:['endpoint_reachable','returns_402','has_bazaar_extension','valid_json'].map(check=>({check,passed:true,severity:'required'}))};
test('expanded live CDP names retain every required gate',()=>{
 const v=structuredClone(base);v.preflight.push({check:'accepts[0].network',passed:true,severity:'required'});
 assert.equal(validValidation(v),true);v.preflight.at(-1).passed=false;assert.equal(validValidation(v),false);
});
test('unknown validator formats are not attributed as official rejection',()=>{
 const v={...base,preflight:[{check:'new_check',passed:true,severity:'required'}]};
 const r=evaluateRoute(getOffer('fix-error'),{},{validator:{status:200,data:v}});
 assert.equal(r.official_validation,'unknown');assert.equal(r.validator_observation.valid,true);assert.equal(r.bazaar_index,'active');
});
test('mandatory Bazaar failure remains rejected despite a healthy unsigned route',()=>{
 const v=structuredClone(base);v.valid=false;v.simulation.outcome='rejected';v.preflight[2].passed=false;v.index=null;
 const r=evaluateRoute(getOffer('hyperxosist-query'),{},{validator:{status:200,data:v}});
 assert.equal(r.official_validation,'rejected');assert.equal(r.bazaar_index,'not_indexed');
});
