#!/bin/bash
# Phase 3 端到端 API 测试脚本
set -e
BASE=http://localhost:7077/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
no() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

echo "=== T1 GET /collection/connectors ==="
T1=$(curl -s $BASE/collection/connectors -H "$AUTH")
echo "$T1" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  total:',d['total'],'categories:',list(d['byCategory'].keys()))" && ok "connectors list"

echo "=== T2 GET /collection/connectors/kingdee-eas-openapi ==="
T2=$(curl -s $BASE/collection/connectors/kingdee-eas-openapi -H "$AUTH")
echo "$T2" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['type']=='kingdee-eas-openapi' and d['auth']=='token' and 'password' in d['secretFields']" && ok "single connector spec"

echo "=== T3 POST /collection/sources/test (kingdee with correct fields) ==="
T3=$(curl -s -X POST $BASE/collection/sources/test -H "$AUTH" -H "Content-Type: application/json" -d '{"connectorType":"kingdee-eas-openapi","config":{"endpoint":"http://eas.example.com","username":"admin","password":"pwd"}}')
echo "$T3" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['status']=='online','got:'+str(d);print('  status:',d['status'],'latencyMs:',d['latencyMs'])" && ok "test connection online"

echo "=== T3b POST /collection/sources/test (placeholder NOT_IMPLEMENTED) ==="
T3B=$(curl -s -X POST $BASE/collection/sources/test -H "$AUTH" -H "Content-Type: application/json" -d '{"connectorType":"kingdee-eas-ws","config":{"endpoint":"x"}}')
echo "$T3B" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['status']=='offline' and 'NOT_IMPLEMENTED' in d.get('error',''),'got:'+str(d);print('  status:',d['status'],'error:',d['error'][:60])" && ok "placeholder returns offline+NOT_IMPLEMENTED"

echo "=== T3c POST /collection/sources/test (no JWT, expect 401) ==="
T3C=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/collection/sources/test -H "Content-Type: application/json" -d '{"connectorType":"x"}')
[ "$T3C" = "401" ] && ok "no-JWT returns 401 (got $T3C)" || no "no-JWT" "expected 401 got $T3C"

echo "=== T4 POST /collection/sources (create with secret password) ==="
T4=$(curl -s -X POST $BASE/collection/sources -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"EAS-测试源","connectorType":"kingdee-eas-openapi","config":{"endpoint":"http://eas.example.com","username":"admin","password":"super-secret-pwd-123"}}')
SID=$(echo "$T4" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['id'])")
echo "  created source id: $SID"
[ -n "$SID" ] && ok "create source" || no "create source" "no id returned"

echo "=== T5 GET /collection/sources/:id (config should be masked) ==="
T5=$(curl -s $BASE/collection/sources/$SID -H "$AUTH")
echo "$T5" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['connectorType']=='kingdee-eas-openapi','connectorType wrong'
assert d['config']['password']=='****','password not masked: '+str(d['config'])
assert d['config']['endpoint']=='http://eas.example.com','endpoint wrong'
print('  connectorType:',d['connectorType'],'config.password:',d['config']['password'])
" && ok "get single source, password masked"

echo "=== T5b verify password NOT in plaintext in DB ==="
sqlite3 /workspace/server/data/supervision.db "SELECT secret_blob FROM data_source_secrets WHERE source_id='$SID'" | python3 -c "
import sys
data=sys.stdin.buffer.read()
assert len(data)>0,'no secret_blob'
assert b'super-secret-pwd-123' not in data,'plaintext password in secret_blob!'
print('  secret_blob bytes:',len(data),'no plaintext password found')
" && ok "secret_blob is encrypted (no plaintext)"

echo "=== T5c verify password NOT in data_sources main table ==="
COUNT=$(sqlite3 /workspace/server/data/supervision.db "SELECT COUNT(*) FROM data_sources WHERE id='$SID' AND (endpoint LIKE '%super-secret%' OR name LIKE '%super-secret%')")
[ "$COUNT" = "0" ] && ok "no plaintext password in main data_sources table" || no "main table leak" "count=$COUNT"

echo "=== T6 GET /collection/sources (list with new V2 fields) ==="
T6=$(curl -s "$BASE/collection/sources" -H "$AUTH")
echo "$T6" | python3 -c "
import sys,json
d=json.load(sys.stdin)
arr=d if isinstance(d,list) else d.get('sources',d.get('data',[]))
assert len(arr)>0,'no sources'
s=[x for x in arr if x.get('id')=='$SID'][0]
assert 'connectorType' in s,'missing connectorType'
assert 'authType' in s,'missing authType'
assert 'healthScore' in s,'missing healthScore'
print('  list count:',len(arr),'test source fields ok')
" && ok "list sources returns V2 fields"

echo "=== T7 POST /collection/sources/:id/test (writes health_history) ==="
T7=$(curl -s -X POST $BASE/collection/sources/$SID/test -H "$AUTH")
echo "$T7" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['status']=='online','got:'+str(d);print('  status:',d['status'],'latencyMs:',d['latencyMs'])" && ok "test by id"
HEALTH_COUNT=$(sqlite3 /workspace/server/data/supervision.db "SELECT COUNT(*) FROM data_source_health WHERE source_id='$SID'")
[ "$HEALTH_COUNT" -ge "1" ] && ok "health_history written ($HEALTH_COUNT rows)" || no "health_history" "no rows"

echo "=== T8 POST /collection/sources/:id/discover ==="
T8=$(curl -s -X POST $BASE/collection/sources/$SID/discover -H "$AUTH")
echo "$T8" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'streams' in d,'no streams'
assert len(d['streams'])>=4,'streams<4 got:'+str(len(d['streams']))
names=[s['name'] for s in d['streams']]
print('  streams:',names)
" && ok "discover schema"
SCHEMA=$(sqlite3 /workspace/server/data/supervision.db "SELECT length(schema_catalog) FROM data_sources WHERE id='$SID'")
[ "$SCHEMA" -gt "10" ] && ok "schema_catalog written (len=$SCHEMA)" || no "schema_catalog" "len=$SCHEMA"

echo "=== T9 GET /collection/sources/:id/health-history ==="
T9=$(curl -s "$BASE/collection/sources/$SID/health-history" -H "$AUTH")
echo "$T9" | python3 -c "
import sys,json
d=json.load(sys.stdin)
arr=d if isinstance(d,list) else d.get('data',[])
assert len(arr)>=1,'no history'
print('  history rows:',len(arr),'first status:',arr[0].get('status'))
" && ok "health-history endpoint"

echo "=== T10 verify audit_logs records written ==="
AUDIT_COUNT=$(sqlite3 /workspace/server/data/supervision.db "SELECT COUNT(*) FROM audit_logs WHERE target LIKE '/collection/sources/$SID%'")
[ "$AUDIT_COUNT" -ge "3" ] && ok "audit_logs has $AUDIT_COUNT records for this source" || no "audit_logs" "only $AUDIT_COUNT records"

echo "=== T11 DELETE /collection/sources/:id (cascade delete) ==="
T11=$(curl -s -X DELETE $BASE/collection/sources/$SID -H "$AUTH")
echo "$T11" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d.get('success')==True,'got:'+str(d)" && ok "delete source"
SECRET_AFTER=$(sqlite3 /workspace/server/data/supervision.db "SELECT COUNT(*) FROM data_source_secrets WHERE source_id='$SID'")
HEALTH_AFTER=$(sqlite3 /workspace/server/data/supervision.db "SELECT COUNT(*) FROM data_source_health WHERE source_id='$SID'")
[ "$SECRET_AFTER" = "0" ] && [ "$HEALTH_AFTER" = "0" ] && ok "cascade delete secrets+health (secrets=$SECRET_AFTER health=$HEALTH_AFTER)" || no "cascade" "secrets=$SECRET_AFTER health=$HEALTH_AFTER"

echo ""
echo "================================"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "================================"
