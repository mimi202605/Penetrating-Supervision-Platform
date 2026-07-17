#!/bin/bash
# Phase 6 端到端 API 测试脚本：监管场景与模型 registry
# 验证：5 场景 + 5 模型 + 16 指标 + 5 模板 + 模型试运行 + 模板实例化
# 全部通过 HTTP 端点验证
set -e
BASE=http://localhost:7077/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
no() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

echo "=== T1 GET /regulatory/scenes?domain=finance-risk 返回 5 个场景 ==="
T1=$(curl -s "$BASE/regulatory/scenes?domain=finance-risk" -H "$AUTH")
echo "$T1" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)==5, 'expect 5 scenes, got: '+str(len(arr))
ids={x['id'] for x in arr}
expect={'sc-fin-dup-pay','sc-fin-private-pay','sc-fin-fake-trade','sc-fin-guarantee','sc-fin-funding-due'}
assert ids==expect, 'scene ids mismatch: '+str(ids)
# 验证字段
s=arr[0]
for f in ['id','domain','issueCode','name','dataSources','indicators','threshold','freq','modelId','enabled']:
  assert f in s, 'missing field: '+f
print('  5 场景齐全，字段完整；dataSources/threshold 已 JSON 解析')
" && ok "scenes list 5 (finance-risk)"

echo "=== T2 GET /regulatory/scenes?domain=investment 返回 0 个（过滤生效） ==="
T2=$(curl -s "$BASE/regulatory/scenes?domain=investment" -H "$AUTH")
T2_COUNT=$(echo "$T2" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$T2_COUNT" = "0" ] && ok "domain filter (investment=0)" || no "domain filter" "got $T2_COUNT"

echo "=== T3 GET /regulatory/scenes/:id 单个场景详情 ==="
T3=$(curl -s "$BASE/regulatory/scenes/sc-fin-dup-pay" -H "$AUTH")
echo "$T3" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['id']=='sc-fin-dup-pay'
assert d['domain']=='finance-risk'
assert d['modelId']=='m-fin-dup-pay-001'
assert isinstance(d['dataSources'], list) and 'treasury-sys' in d['dataSources']
assert isinstance(d['threshold'], dict) and 'yellow' in d['threshold']
print('  场景详情字段完整，dataSources/threshold 已 JSON 解析')
" && ok "scene detail"

echo "=== T4 GET /regulatory/scenes/:id/detail 场景含模型+指标联查 ==="
T4=$(curl -s "$BASE/regulatory/scenes/sc-fin-dup-pay/detail" -H "$AUTH")
echo "$T4" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['id']=='sc-fin-dup-pay'
assert 'models' in d and len(d['models'])>=1, 'no models'
m=d['models'][0]
assert m['id']=='m-fin-dup-pay-001'
assert 'indicators' in d and len(d['indicators'])>=3, 'no indicators'
print('  场景含模型:',len(d['models']),'指标:',len(d['indicators']))
" && ok "scene with model + indicators"

echo "=== T5 GET /regulatory/models 返回 5 个模型 ==="
T5=$(curl -s "$BASE/regulatory/models" -H "$AUTH")
echo "$T5" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)==5, 'expect 5 models, got: '+str(len(arr))
for m in arr:
  assert 'ruleDsl' in m and isinstance(m['ruleDsl'], dict), 'ruleDsl must be parsed JSON: '+m['id']
  assert 'thresholdJson' in m and isinstance(m['thresholdJson'], dict), 'thresholdJson must be parsed'
  assert m['status']=='online'
  assert m['version']=='1.0.0'
print('  5 模型齐全，ruleDsl/thresholdJson 已 JSON 解析')
" && ok "models list 5"

echo "=== T6 GET /regulatory/models?sceneId=sc-fin-dup-pay 过滤 ==="
T6=$(curl -s "$BASE/regulatory/models?sceneId=sc-fin-dup-pay" -H "$AUTH")
T6_COUNT=$(echo "$T6" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$T6_COUNT" = "1" ] && ok "sceneId filter (1 model)" || no "sceneId filter" "got $T6_COUNT"

echo "=== T7 GET /regulatory/models/:id 含指标列表 ==="
T7=$(curl -s "$BASE/regulatory/models/m-fin-dup-pay-001" -H "$AUTH")
echo "$T7" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['id']=='m-fin-dup-pay-001'
assert 'indicators' in d and len(d['indicators'])>=3, 'indicators missing or <3'
for i in d['indicators']:
  assert 'id' in i and 'name' in i and 'expr' in i
# 验证 rule_dsl 是 json-rules-engine 格式
rd=d['ruleDsl']
assert 'conditions' in rd and 'event' in rd
assert 'all' in rd['conditions']
print('  模型:',d['id'],'指标数:',len(d['indicators']),'rule_dsl.conditions.all len:',len(rd['conditions']['all']))
" && ok "model with indicators"

echo "=== T8 GET /regulatory/models/:modelId/indicators ==="
T8=$(curl -s "$BASE/regulatory/models/m-fin-private-pay-001/indicators" -H "$AUTH")
echo "$T8" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)==3, 'expect 3 indicators, got: '+str(len(arr))
for i in arr:
  assert i['modelId']=='m-fin-private-pay-001'
print('  m-fin-private-pay-001 指标数:',len(arr))
" && ok "indicators list (3)"

echo "=== T9 验证 5 个模型的指标数分布（4+3+3+3+3=16） ==="
TOTAL=0
for MID in m-fin-dup-pay-001 m-fin-private-pay-001 m-fin-fake-trade-001 m-fin-guarantee-001 m-fin-funding-due-001; do
  C=$(curl -s "$BASE/regulatory/models/$MID/indicators" -H "$AUTH" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
  echo "  $MID: $C 个指标"
  TOTAL=$((TOTAL+C))
done
[ "$TOTAL" = "16" ] && ok "indicators total = 16" || no "indicators total" "got $TOTAL (expect 16)"

echo "=== T10 POST /regulatory/models/m-fin-dup-pay-001/test 命中试运行 ==="
T10=$(curl -s -X POST "$BASE/regulatory/models/m-fin-dup-pay-001/test" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "facts": [
    {"payee":"vendor-001","amount":10000,"dupCount":3,"day":"2026-07-17"},
    {"payee":"vendor-002","amount":20000,"dupCount":1,"day":"2026-07-17"},
    {"payee":"vendor-003","amount":30000,"dupCount":5,"day":"2026-07-17"}
  ]
}')
echo "$T10" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['modelId']=='m-fin-dup-pay-001'
# dupCount>=2 命中：vendor-001(3), vendor-003(5) → 2 hits
assert d['hitCount']==2, 'expect 2 hits, got: '+str(d['hitCount'])
for h in d['hits']:
  assert h['riskLevel']=='yellow'
  assert h['facts']['dupCount']>=2
print('  hitCount:',d['hitCount'],'命中风险等级:',[h['riskLevel'] for h in d['hits']])
" && ok "model test (2 hits)"

echo "=== T11 POST 模型试运行不命中（dupCount<2） ==="
T11=$(curl -s -X POST "$BASE/regulatory/models/m-fin-dup-pay-001/test" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "facts": [{"payee":"v","amount":1,"dupCount":1,"day":"2026-07-17"}]
}')
echo "$T11" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['hitCount']==0
print('  hitCount:',d['hitCount'])
" && ok "model test (0 hits)"

echo "=== T12 POST m-fin-private-pay-001 试运行（hour<6 + isPrivate + amount>=50000） ==="
T12=$(curl -s -X POST "$BASE/regulatory/models/m-fin-private-pay-001/test" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "facts": [
    {"hour":3,"isPrivate":true,"amount":80000},
    {"hour":12,"isPrivate":true,"amount":80000},
    {"hour":3,"isPrivate":false,"amount":80000},
    {"hour":3,"isPrivate":true,"amount":30000}
  ]
}')
echo "$T12" | python3 -c "
import sys,json
d=json.load(sys.stdin)
# 仅第 1 条命中（hour<6 + isPrivate + amount>=50000）
assert d['hitCount']==1, 'expect 1 hit, got: '+str(d['hitCount'])
print('  hitCount:',d['hitCount'])
" && ok "private-pay model (1 hit)"

echo "=== T13 POST m-fin-funding-due-001 试运行（daysToDue<=30） ==="
T13=$(curl -s -X POST "$BASE/regulatory/models/m-fin-funding-due-001/test" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "facts": [
    {"daysToDue":25,"amount":1000000},
    {"daysToDue":60,"amount":2000000},
    {"daysToDue":5,"amount":500000}
  ]
}')
echo "$T13" | python3 -c "
import sys,json
d=json.load(sys.stdin)
# 25 和 5 命中（<=30），60 不命中
assert d['hitCount']==2, 'expect 2 hits, got: '+str(d['hitCount'])
print('  hitCount:',d['hitCount'])
" && ok "funding-due model (2 hits)"

echo "=== T14 POST m-fin-guarantee-001 试运行（ratio>1） ==="
T14=$(curl -s -X POST "$BASE/regulatory/models/m-fin-guarantee-001/test" -H "$AUTH" -H "Content-Type: application/json" -d '{
  "facts": [
    {"guaranteeAmount":1000,"shareholdingRatio":50,"ratio":20},
    {"guaranteeAmount":100,"shareholdingRatio":200,"ratio":0.5}
  ]
}')
echo "$T14" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['hitCount']==1, 'expect 1 hit, got: '+str(d['hitCount'])
print('  hitCount:',d['hitCount'])
" && ok "guarantee model (1 hit)"

echo "=== T15 GET /regulatory/templates 返回 5 个模板 ==="
T15=$(curl -s "$BASE/regulatory/templates" -H "$AUTH")
echo "$T15" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
assert len(arr)==5, 'expect 5 templates, got: '+str(len(arr))
ids={x['id'] for x in arr}
expect={'tpl-dup-pay','tpl-private-pay','tpl-fake-trade','tpl-guarantee','tpl-funding-due'}
assert ids==expect, 'template ids mismatch: '+str(ids)
for t in arr:
  assert 'transformPipeline' in t and isinstance(t['transformPipeline'], dict), 'transformPipeline must be parsed: '+t['id']
  assert 'fieldMapping' in t and isinstance(t['fieldMapping'], dict)
print('  5 模板齐全，transformPipeline/fieldMapping 已 JSON 解析')
" && ok "templates list 5"

echo "=== T16 POST /regulatory/templates/:id/instantiate 创建 collection_task ==="
T16=$(curl -s -X POST "$BASE/regulatory/templates/tpl-dup-pay/instantiate" -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"E2E-重复支付采集任务"}')
NEW_TASK_ID=$(echo "$T16" | python3 -c "import sys,json;print(json.load(sys.stdin)['taskId'])")
echo "  new task id: $NEW_TASK_ID"
echo "$T16" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'taskId' in d and d['taskId'].startswith('T-')
assert d['templateId']=='tpl-dup-pay'
print('  taskId:',d['taskId'],'templateId:',d['templateId'])
" && ok "instantiate template"

echo "=== T17 验证实例化的任务含 scene_id + model_id + transform_pipeline ==="
T17=$(curl -s "$BASE/collection/tasks/$NEW_TASK_ID" -H "$AUTH")
echo "$T17" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['id']=='$NEW_TASK_ID'
assert d['sceneId']=='sc-fin-dup-pay', 'sceneId: '+str(d.get('sceneId'))
assert d['modelId']=='m-fin-dup-pay-001', 'modelId: '+str(d.get('modelId'))
assert d['source']=='treasury-sys'
assert d['transformPipeline'] and isinstance(d['transformPipeline'], dict)
assert 'steps' in d['transformPipeline']
print('  sceneId:',d['sceneId'],'modelId:',d['modelId'],'source:',d['source'],'steps:',len(d['transformPipeline']['steps']))
" && ok "instantiated task has scene+model+pipeline"

echo "=== T18 GET /regulatory/scenes/:id 404 ==="
T18=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/regulatory/scenes/NON-EXIST" -H "$AUTH")
[ "$T18" = "404" ] && ok "non-existent scene 404" || no "404" "expected 404 got $T18"

echo "=== T19 GET /regulatory/models/:id 404 ==="
T19=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/regulatory/models/NON-EXIST" -H "$AUTH")
[ "$T19" = "404" ] && ok "non-existent model 404" || no "404" "expected 404 got $T19"

echo "=== T20 POST /regulatory/models/:id/test 缺 facts → 400 ==="
T20=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/regulatory/models/m-fin-dup-pay-001/test" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T20" = "400" ] && ok "test without facts 400" || no "400" "expected 400 got $T20"

echo "=== T21 无 JWT → 401 ==="
T21=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/regulatory/scenes")
[ "$T21" = "401" ] && ok "no-JWT 401" || no "no-JWT" "expected 401 got $T21"

echo "=== T22 清理：DELETE 实例化任务 ==="
T22=$(curl -s -X DELETE "$BASE/collection/tasks/$NEW_TASK_ID" -H "$AUTH")
echo "$T22" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d.get('success')==True" && ok "cleanup instantiated task"

echo ""
echo "================================"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "================================"
