import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {REPO,ISSUE,readState,transition,renderState,noticeId,validateSnapshot} from './revenue-monitor.mjs';

const root=`/repos/${REPO}/issues/${ISSUE}`;
export async function publish(current,{env=process.env,fetchImpl=fetch,now=Date.now()}={}) {
  validateSnapshot(current);
  if(env.GITHUB_REPOSITORY!==REPO || env.GITHUB_REF!=='refs/heads/main' || !['schedule','workflow_dispatch','push'].includes(env.GITHUB_EVENT_NAME) ||
      !/^\d+$/.test(env.GITHUB_RUN_ID||'') || !env.GH_TOKEN) throw new Error('TRUSTED_MAIN_CONTEXT_REQUIRED');
  if(Date.parse(current.checked_at)>now+60000 || now-Date.parse(current.checked_at)>3600000)throw new Error('STALE_MONITOR_OBSERVATION');
  async function api(path,method='GET',body) {
    const allowed=path===root || path===root+'/comments' || path.startsWith(root+'/comments?since=');
    if(!allowed || !['GET','PATCH','POST'].includes(method))throw new Error('API_PATH_NOT_ALLOWED');
    const r=await fetchImpl('https://api.github.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','Content-Type':'application/json',Authorization:`Bearer ${env.GH_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok || r.redirected)throw new Error('GITHUB_MONITOR_WRITE_FAILED');
    // Fixed GitHub endpoint, bounded response. Never print exceptions or raw bodies.
    const reader=r.body?.getReader();if(!reader)throw new Error('EMPTY_GITHUB_RESPONSE');
    const chunks=[];let size=0;
    try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw new Error('GITHUB_RESPONSE_LIMIT');}chunks.push(value);}} finally {reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const issue=await api(root);
  if(issue.number!==ISSUE || issue.pull_request || issue.state!=='open')throw new Error('MONITOR_ISSUE_NOT_OPEN');
  const previous=readState(issue.body),next=transition(previous,current);
  if(next.ignored)return {ignored:true,notified:false};
  const runUrl=`https://github.com/${REPO}/actions/runs/${env.GITHUB_RUN_ID}`;
  let notified=false;
  if(next.events.length) {
    const marker=`<!-- kg-x402-notice:${noticeId(previous,next.events)} -->`;
    const since=encodeURIComponent(previous?.last??new Date(now-86400000).toISOString());
    let exists=false,complete=false;
    for(let page=1;page<=5;page++) {
      const comments=await api(`${root}/comments?since=${since}&per_page=100&page=${page}`);
      if(!Array.isArray(comments))throw new Error('INVALID_COMMENT_RESPONSE');
      if(comments.some(c=>c.user?.login==='github-actions[bot]'&&typeof c.body==='string'&&c.body.includes(marker)))exists=true;
      if(comments.length<100){complete=true;break;}
    }
    if(!complete)throw new Error('COMMENT_DEDUP_SCAN_INCOMPLETE');
    if(!exists) {
      await api(root+'/comments','POST',{body:`${marker}\n${current.checked_at} の重要変更\n\n${next.events.map(x=>'- '+x).join('\n')}\n\n[観測証跡](${runUrl})\n未払い監査と提供側集計です。実購入・外部顧客・納品成功の確認とは区別します。`});
      notified=true;
    }
  }
  // Comment first, then state. A failed state write can be retried without duplicate notice.
  await api(root,'PATCH',{body:renderState(next.state,runUrl)});
  return {ignored:false,notified,changes:next.events.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  (async()=>{
    if(process.argv.length!==2)throw new Error('NO_ARGUMENTS_ALLOWED');
    const text=await readFile('audit/monitor-observation.json','utf8');
    if(text.length>64000)throw new Error('OBSERVATION_LIMIT');
    console.log(JSON.stringify(await publish(JSON.parse(text))));
  })().catch(()=>{console.error('MONITOR_PUBLISH_FAILED: check trusted main context, issue marker and issue-write permission.');process.exitCode=1;});
}
