#!/bin/bash
# Phase 4 端到端 API 测试脚本：Transform 管道
set -e
BASE=http://localhost:7077/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
no() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

echo "=== T1 GET /collection/transforms/types ==="
T1=$(curl -s $BASE/collection/transforms/types -H "$AUTH")
echo "$T1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['total']==13,'total: '+str(d['total'])
cats=set(t['category'] for t in d['types'])
assert cats=={'basic','data-quality','security','regulatory'}, 'cats: '+str(cats)
for t in d['types']:
  assert t['configSchema']['type']=='object', t['type']+' schema 缺 object'
print('  total:',d['total'],'categories:',sorted(cats))
" && ok "transforms types list"

echo "=== T1b GET /collection/transforms/types 无 JWT → 401 ==="
T1B=$(curl -s -o /dev/null -w "%{http_code}" $BASE/collection/transforms/types)
[ "$T1B" = "401" ] && ok "no-JWT 401 (got $T1B)" || no "no-JWT" "expected 401 got $T1B"

echo "=== T2 POST /collection/transforms/preview field-mapping ==="
T2=$(curl -s -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"FNumber":"001","FName":"张三","FExtra":"x"}],
  "pipeline":{"steps":[{"id":"s1","type":"field-mapping","config":{"mapping":{"FNumber":"code","FName":"name"},"includeOnly":true}}]}
}')
echo "$T2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['output']==[{'code':'001','name':'张三'}], 'output: '+json.dumps(d['output'])
assert d['totalWrite']==1
print('  output:',d['output'])
" && ok "field-mapping preview"

echo "=== T3 POST /collection/transforms/preview flatten (1进2出) ==="
T3=$(curl -s -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"FVoucherNumber":"V-001","FEntry":[{"FAccount":"1001","FDebit":1000},{"FAccount":"1002","FCredit":1000}]}],
  "pipeline":{"steps":[{"id":"s1","type":"flatten","config":{"field":"FEntry","prefix":"entry_","mode":"spread"}}]}
}')
echo "$T3" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['totalWrite']==2,'write: '+str(d['totalWrite'])
assert d['output'][0]['entry_FAccount']=='1001'
assert 'FEntry' not in d['output'][1]
print('  totalWrite:',d['totalWrite'])
" && ok "flatten preview"

echo "=== T4 POST /collection/transforms/preview mask (脱敏) ==="
T4=$(curl -s -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"idcard":"110101199001011234"}],
  "pipeline":{"steps":[{"id":"s1","type":"mask","config":{"fields":[{"name":"idcard","strategy":"keep-edges","keepPrefix":6,"keepSuffix":4}]}}]}
}')
echo "$T4" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['output'][0]['idcard']=='110101********1234', 'got: '+d['output'][0]['idcard']
print('  masked idcard:',d['output'][0]['idcard'])
" && ok "mask preview"

echo "=== T5 POST /collection/transforms/preview script (vm2) ==="
T5=$(curl -s -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"x":1}],
  "pipeline":{"steps":[{"id":"s1","type":"script","config":{"code":"return { ...record, _ts: 1 }"}}]}
}')
echo "$T5" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['output'][0]['x']==1 and d['output'][0]['_ts']==1
print('  script output:',d['output'][0])
" && ok "script preview"

echo "=== T6 POST /collection/transforms/preview 多步骤串联 ==="
T6=$(curl -s -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"FNumber":"001","amount":"100.56","idcard":"110101199001011234"}],
  "pipeline":{"steps":[
    {"id":"s1","type":"field-mapping","config":{"mapping":{"FNumber":"code"}}},
    {"id":"s2","type":"type-cast","config":{"fields":{"amount":{"target":"decimal","format":"0.00"}}}},
    {"id":"s3","type":"mask","config":{"fields":[{"name":"idcard","strategy":"fixed"}]}}
  ]}
}')
echo "$T6" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['totalWrite']==1
o=d['output'][0]
assert o['code']=='001' and o['amount']==100.56 and o['idcard']=='****'
assert 'FNumber' not in o
print('  chained output:',o)
" && ok "chained pipeline"

echo "=== T7 POST /collection/transforms/preview 证据快照 ==="
T7=$(curl -s -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"amount":200},{"amount":50}],
  "pipeline":{"steps":[{"id":"s1","type":"evidence-snapshot","config":{"ruleId":"R-001","condition":"amount > 100"}}]}
}')
echo "$T7" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['totalWrite']==2
assert len(d['evidence'])==1
assert d['evidence'][0]['ruleId']=='R-001'
assert d['evidence'][0]['snapshot']['amount']==200
print('  evidence count:',len(d['evidence']))
" && ok "evidence snapshot"

echo "=== T8 POST /collection/transforms/preview 缺参数 → 400 ==="
T8=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T8" = "400" ] && ok "missing body returns 400 (got $T8)" || no "missing body" "expected 400 got $T8"

echo "=== T9 POST /collection/transforms/preview errorLimit 触发 422 ==="
T9=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/collection/transforms/preview -H "$AUTH" -H "Content-Type: application/json" -d '{
  "sample":[{"x":"a"},{"x":"b"}],
  "pipeline":{"steps":[{"id":"s1","type":"type-cast","config":{"fields":{"x":{"target":"number"}}}}],"errorLimit":{"rate":0.5}}
}')
[ "$T9" = "422" ] && ok "errorLimit returns 422 (got $T9)" || no "errorLimit" "expected 422 got $T9"

echo ""
echo "================================"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "================================"
