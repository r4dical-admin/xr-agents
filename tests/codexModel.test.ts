import { it, expect } from 'vitest';
import { normalizeContent, normalizeServerEvent, normalizeTask } from '../electron/codexModel';
it('preserves real desktop task identity and distinguishes unloaded from idle', () => {
  expect(normalizeTask({id:'a',name:'Actual title',cwd:'/project',source:'appServer',status:{type:'notLoaded'}})).toMatchObject({title:'Actual title',cwd:'/project',source:'appServer',status:'notLoaded'});
});
it('normalizes live deltas, command output and completion events', () => {
  expect(normalizeServerEvent('item/agentMessage/delta', {threadId:'t',turnId:'v',itemId:'m',delta:'Hello'})).toMatchObject({type:'MESSAGE_DELTA',threadId:'t',turnId:'v',itemId:'m',delta:'Hello'});
  expect(normalizeServerEvent('item/commandExecution/outputDelta', {threadId:'t',turnId:'v',itemId:'c',delta:'passed'})).toMatchObject({type:'COMMAND_OUTPUT',itemId:'c',delta:'passed'});
  expect(normalizeServerEvent('turn/completed', {threadId:'t',turn:{id:'v',status:'completed',error:null}})).toMatchObject({type:'TURN_COMPLETED',threadId:'t',turnId:'v',status:'completed'});
  expect(normalizeServerEvent('thread/tokenUsage/updated', {threadId:'t',turnId:'v',tokenUsage:{total:{totalTokens:12000},last:{totalTokens:700},modelContextWindow:200000}})).toMatchObject({type:'TOKEN_USAGE',usage:{used:12000,last:700,context:200000,remaining:188000}});
});
it('normalizes official command and file approval requests', () => {
  const command = normalizeServerEvent('item/commandExecution/requestApproval', {threadId:'t',turnId:'v',itemId:'c',command:'npm install ws',reason:'Network access',availableDecisions:['accept','acceptForSession','decline']}, 41);
  expect(command).toMatchObject({type:'APPROVAL_REQUESTED',approval:{requestId:'41',kind:'command',command:'npm install ws',allowSession:true}});
  const file = normalizeServerEvent('item/fileChange/requestApproval', {threadId:'t',turnId:'v',itemId:'f',grantRoot:'/project'}, 'approval-1');
  expect(file).toMatchObject({type:'APPROVAL_REQUESTED',approval:{requestId:'approval-1',kind:'file',command:'/project'}});
});
it('normalizes messages, saved output and diffs without leaking unknown provider fields', () => {
  const result=normalizeContent({id:'a',turns:[{items:[
    {id:'u',type:'userMessage',content:[{type:'text',text:'Hello <script>'}]},
    {id:'a',type:'agentMessage',text:'Hello'},
    {id:'c',type:'commandExecution',command:'npm test',aggregatedOutput:'passed',exitCode:0,status:'completed'},
    {id:'f',type:'fileChange',changes:[{path:'a.ts',diff:'+ok'}]},
    {type:'reasoning',content:['private reasoning']}
  ]}]});
  expect(result.items).toHaveLength(4);
  expect(result.items[0].text).toBe('Hello <script>');
  expect(result.items[2]).toMatchObject({kind:'command',detail:'passed',status:'completed · exit 0'});
  expect(result.items[3]).toMatchObject({kind:'file',text:'a.ts',detail:'+ok'});
});
