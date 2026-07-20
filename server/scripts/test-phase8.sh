#!/bin/bash
# Phase 8 端到端 API 测试脚本：四级穿透与联查（Task 17-18）
# 验证链路：
#   Task 17: penetration 四级下钻 ads → dws → dwd → ods + getLineageGraph + 向后兼容
#   Task 18: linkage 联查规则 listRules / executeRule（按 drill_path 逐级下钻）
# 全部通过 HTTP 端点验证；使用时间戳后缀 ID 实现幂等可重跑
set -e
BASE=http://localhost:7077/api/v1
LOGIN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['id'])")
AUTH="Authorization: Bearer $TOKEN"
PASS=0; FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
no() { echo "  ✗ $1: $2"; FAIL=$((FAIL+1)); }

# JSON 构造辅助：用 python3 生成，避免 shell 转义地狱
json() { python3 -c "import sys,json;print(json.dumps($1))"; }

# 幂等 ID：时间戳后缀
TS=$(date +%s)
DS_ID="DS-E2E-PH8-$TS"
PEN_TASK="T-E2E-PH8-$TS"
# 使用 sc-fin-dup-pay 场景（预置 4 个指标 ind-dup-1..4 + 模型 m-fin-dup-pay-001）
SCENE_ID="sc-fin-dup-pay"
INDICATOR_ID="ind-dup-1"

echo "=========================================="
echo "  Phase 8 E2E：四级穿透与联查（Task 17-18）"
echo "  run-ts=$TS  user=$USER_ID"
echo "=========================================="

# ============================================================
# Part A：联查规则列表 + 过滤 + 单条详情（Task 18）
# ============================================================
echo ""
echo "=== Part A：联查规则列表（Task 18 listRules） ==="

echo "--- T1 GET /linkage/rules 返回 10 条预置规则 ---"
T1=$(curl -s "$BASE/linkage/rules" -H "$AUTH")
T1_CNT=$(echo "$T1" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$T1_CNT" = "10" ] && ok "联查规则 10 条" || no "联查规则数量" "expect 10, got $T1_CNT"

echo "--- T2 GET /linkage/rules?sceneId=sc-fin-dup-pay 按场景过滤 ---"
T2=$(curl -s "$BASE/linkage/rules?sceneId=$SCENE_ID" -H "$AUTH")
T2_CNT=$(echo "$T2" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
T2_OK=$(echo "$T2" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
ok = len(arr)>=1 and all(r['sceneId']=='$SCENE_ID' for r in arr)
print('1' if ok else '0')
")
[ "$T2_CNT" -ge "1" ] 2>/dev/null && [ "$T2_OK" = "1" ] && ok "sceneId 过滤生效 (count=$T2_CNT)" || no "场景过滤" "count=$T2_CNT ok=$T2_OK"

echo "--- T3 GET /linkage/rules/LR-FIN-DUP-PAY-001 单条规则 + drillPath 解析 ---"
T3=$(curl -s "$BASE/linkage/rules/LR-FIN-DUP-PAY-001" -H "$AUTH")
T3_OK=$(echo "$T3" | python3 -c "
import sys,json
r=json.load(sys.stdin)
ok = r['id']=='LR-FIN-DUP-PAY-001' and r['sceneId']=='sc-fin-dup-pay' and r['drillPath']==['ads','dws','dwd','ods']
print('1' if ok else '0')
")
[ "$T3_OK" = "1" ] && ok "单条规则字段完整 (drillPath=ads,dws,dwd,ods)" || no "单条规则" "$T3"

echo "--- T3b GET /linkage/rules/NONEXISTENT → 404 ---"
T3B_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/linkage/rules/LR-NONEXISTENT" -H "$AUTH")
[ "$T3B_HTTP" = "404" ] && ok "不存在规则返回 404" || no "404" "http=$T3B_HTTP"

# ============================================================
# Part B：触发采集任务写入 data_lineage + ods_generic（为下钻准备数据）
# ============================================================
echo ""
echo "=== Part B：触发采集任务写入血缘数据 ==="

echo "--- T4 创建数据源 $DS_ID（treasury-sys mock） ---"
T4=$(curl -s -X POST "$BASE/collection/sources" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$DS_ID','name':'E2E穿透测试源','connectorType':'treasury-sys','config':{'endpoint':'http://mock-treasury.local','token':'mock-token-123'}}")")
T4_ID=$(echo "$T4" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ "$T4_ID" = "$DS_ID" ] && ok "创建数据源 $DS_ID" || no "创建数据源" "$T4"

echo "--- T4b discover 探测 schema（写入 schema_catalog，runtime 据此切分 splits） ---"
T4B=$(curl -s -X POST "$BASE/collection/sources/$DS_ID/discover" -H "$AUTH")
T4B_CNT=$(echo "$T4B" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('streams',[])))" 2>/dev/null || echo 0)
[ "$T4B_CNT" -ge "1" ] 2>/dev/null && ok "discover 写入 schema_catalog ($T4B_CNT streams)" || no "discover" "$T4B"

echo "--- T5 创建采集任务 $PEN_TASK（绑定场景 $SCENE_ID，sink_target=ods_payment_flow） ---"
# 关键：sink_target 设为 ods_payment_flow，使 data_lineage.sink_table=ods_payment_flow
# 不绑定 modelId（避免触发风险线索创建干扰），仅验证穿透链路
T5=$(curl -s -X POST "$BASE/collection/tasks" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'id':'$PEN_TASK','name':'E2E穿透数据准备任务','source':'treasury-sys','mode':'全量','sourceId':'$DS_ID','sinkType':'ods-generic','sinkTarget':'ods_payment_flow','writeMode':'append','concurrency':1,'sceneId':'$SCENE_ID','enabled':1}")")
T5_ID=$(echo "$T5" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ "$T5_ID" = "$PEN_TASK" ] && ok "创建任务 $PEN_TASK (sceneId=$SCENE_ID)" || no "创建任务" "$T5"

echo "--- T6 触发任务并轮询至 success（最多 30s） ---"
curl -s -X POST "$BASE/collection/tasks/$PEN_TASK/trigger" -H "$AUTH" -H "Content-Type: application/json" -d '{}' > /dev/null
RUN_OK=0
for i in $(seq 1 30); do
  sleep 1
  T6=$(curl -s "$BASE/collection/tasks/$PEN_TASK/runs" -H "$AUTH")
  T6_STATUS=$(echo "$T6" | python3 -c "import sys,json;runs=json.load(sys.stdin);print(runs[0]['status'] if runs else 'none')" 2>/dev/null || echo "err")
  if [ "$T6_STATUS" = "success" ]; then RUN_OK=1; break; fi
done
[ "$RUN_OK" = "1" ] && ok "任务运行成功 (status=success)" || no "任务运行" "最后状态: $T6_STATUS"

echo "--- T7 验证 data_lineage 已写入场景 $SCENE_ID 的血缘 ---"
T7=$(curl -s "$BASE/collection/tasks/$PEN_TASK/lineage" -H "$AUTH")
T7_CNT=$(echo "$T7" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
T7_LAYER_OK=$(echo "$T7" | python3 -c "
import sys,json
arr=json.load(sys.stdin)
ok = len(arr)>0 and all(r.get('layer')=='ods' for r in arr)
print('1' if ok else '0')
")
[ "$T7_CNT" -gt "0" ] 2>/dev/null && [ "$T7_LAYER_OK" = "1" ] && ok "data_lineage 写入 $T7_CNT 条 (layer=ods)" || no "血缘写入" "count=$T7_CNT layer_ok=$T7_LAYER_OK"

# ============================================================
# Part C：penetration ADS → DWS 下钻（Task 17.1）
# ============================================================
echo ""
echo "=== Part C：penetration ADS 下钻（Task 17 drillADS） ==="

echo "--- T8 GET /penetration/ads/$INDICATOR_ID 返回 indicator + sceneId + dwsBlocks ---"
T8=$(curl -s "$BASE/penetration/ads/$INDICATOR_ID" -H "$AUTH")
T8_OK=$(echo "$T8" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ind = d.get('indicator') or {}
ok = ind.get('id')=='ind-dup-1' and ind.get('modelId')=='m-fin-dup-pay-001' and d.get('sceneId')=='sc-fin-dup-pay' and len(d.get('dwsBlocks',[]))>=1
print('1' if ok else '0')
")
[ "$T8_OK" = "1" ] && ok "drillADS 返回 indicator + sceneId + dwsBlocks 非空" || no "drillADS" "$T8"

# 取第一个 dwsBlock 的 blockId 用于后续测试
DWS_BLOCK_ID=$(echo "$T8" | python3 -c "
import sys,json
d=json.load(sys.stdin)
blocks=d.get('dwsBlocks',[])
print(blocks[0]['blockId'] if blocks else '')
")
echo "  → 第一个 DWS blockId = $DWS_BLOCK_ID"

echo "--- T9 GET /penetration/ads/nonexistent → 404 ---"
T9_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/ads/ind-NONEXISTENT" -H "$AUTH")
[ "$T9_HTTP" = "404" ] && ok "不存在指标返回 404" || no "ADS 404" "http=$T9_HTTP"

# ============================================================
# Part D：penetration DWS → DWD 下钻（Task 17.2）
# ============================================================
echo ""
echo "=== Part D：penetration DWS 下钻（Task 17 drillDWS） ==="

echo "--- T10 GET /penetration/dws/$DWS_BLOCK_ID 返回 lineage + dwdDetails ---"
T10=$(curl -s "$BASE/penetration/dws/$DWS_BLOCK_ID" -H "$AUTH")
T10_OK=$(echo "$T10" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ok = d.get('blockId')=='$DWS_BLOCK_ID' and len(d.get('lineage',[]))>=1 and len(d.get('dwdDetails',[]))>=1
print('1' if ok else '0')
")
[ "$T10_OK" = "1" ] && ok "drillDWS 返回 lineage + dwdDetails 非空" || no "drillDWS" "$T10"

# 取第一个 dwdDetail 的 detailId
DWD_DETAIL_ID=$(echo "$T10" | python3 -c "
import sys,json
d=json.load(sys.stdin)
details=d.get('dwdDetails',[])
print(details[0]['detailId'] if details else '')
")
echo "  → 第一个 DWD detailId = $DWD_DETAIL_ID"

echo "--- T11 GET /penetration/dws/nonexistent_block → 404（lineage 和 dwdDetails 均空） ---"
T11_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/dws/ods_nonexistent_block_xyz" -H "$AUTH")
[ "$T11_HTTP" = "404" ] && ok "不存在 block 返回 404" || no "DWS 404" "http=$T11_HTTP"

# ============================================================
# Part E：penetration DWD → ODS 下钻（Task 17.3 + 17.4）
# ============================================================
echo ""
echo "=== Part E：penetration DWD/ODS 下钻（Task 17 drillDWD + drillODS） ==="

echo "--- T12 GET /penetration/dwd/$DWD_DETAIL_ID 返回 odsDocs（含原始 record） ---"
T12=$(curl -s "$BASE/penetration/dwd/$DWD_DETAIL_ID" -H "$AUTH")
T12_OK=$(echo "$T12" | python3 -c "
import sys,json
d=json.load(sys.stdin)
docs=d.get('odsDocs',[])
ok = d.get('detailId')==$DWD_DETAIL_ID and len(docs)>=1 and isinstance(docs[0].get('record'),dict)
print('1' if ok else '0')
")
[ "$T12_OK" = "1" ] && ok "drillDWD 返回 odsDocs 含原始 record (dict)" || no "drillDWD" "$T12"

echo "--- T13 GET /penetration/ods/$DWD_DETAIL_ID 返回解析后原始单据 ---"
T13=$(curl -s "$BASE/penetration/ods/$DWD_DETAIL_ID" -H "$AUTH")
T13_OK=$(echo "$T13" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ok = d.get('docId')==$DWD_DETAIL_ID and isinstance(d.get('record'),dict) and d.get('stream') and d.get('taskId')
print('1' if ok else '0')
")
[ "$T13_OK" = "1" ] && ok "drillODS 返回原始单据 (record 为 dict)" || no "drillODS" "$T13"

echo "--- T14 GET /penetration/dwd/99999999 → 404 ---"
T14_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/dwd/99999999" -H "$AUTH")
[ "$T14_HTTP" = "404" ] && ok "不存在 detail 返回 404" || no "DWD 404" "http=$T14_HTTP"

echo "--- T15 GET /penetration/ods/99999999 → 404 ---"
T15_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/ods/99999999" -H "$AUTH")
[ "$T15_HTTP" = "404" ] && ok "不存在 doc 返回 404" || no "ODS 404" "http=$T15_HTTP"

echo "--- T16 GET /penetration/dwd/abc → 400（非整数） ---"
T16_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/dwd/abc" -H "$AUTH")
[ "$T16_HTTP" = "400" ] && ok "非整数 detailId 返回 400" || no "DWD 400" "http=$T16_HTTP"

# ============================================================
# Part F：penetration lineage 图谱（Task 17.5）
# ============================================================
echo ""
echo "=== Part F：penetration lineage 图谱（Task 17 getLineageGraph） ==="

echo "--- T17 GET /penetration/lineage?sceneId=$SCENE_ID 返回 nodes + edges ---"
T17=$(curl -s "$BASE/penetration/lineage?sceneId=$SCENE_ID" -H "$AUTH")
T17_OK=$(echo "$T17" | python3 -c "
import sys,json
d=json.load(sys.stdin)
nodes=d.get('nodes',[])
edges=d.get('edges',[])
# 应有 ADS 节点（4 个 ind-dup 指标）+ DWS 节点（ods_payment_flow）+ DWD 节点（ods_generic 行）
# 边：ADS→DWS + DWS→DWD
types = set(n.get('type') for n in nodes)
ok = len(nodes)>=1 and 'ads' in types and len(edges)>=1
print('1' if ok else '0')
")
[ "$T17_OK" = "1" ] && ok "getLineageGraph 返回 nodes+edges (含 ADS/DWS/DWD)" || no "lineage graph" "$T17"

echo "--- T18 GET /penetration/lineage（无 sceneId）→ 400 ---"
T18_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/lineage" -H "$AUTH")
[ "$T18_HTTP" = "400" ] && ok "无 sceneId 返回 400" || no "lineage 400" "http=$T18_HTTP"

echo "--- T19 GET /penetration/lineage?sceneId=scene-nonexistent → 404（无节点） ---"
T19_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/lineage?sceneId=scene-nonexistent-xyz" -H "$AUTH")
[ "$T19_HTTP" = "404" ] && ok "不存在场景返回 404" || no "lineage 404" "http=$T19_HTTP"

# ============================================================
# Part G：linkage execute 联查执行（Task 18 executeRule）
# ============================================================
echo ""
echo "=== Part G：linkage 联查执行（Task 18 executeRule） ==="

echo "--- T20 POST /linkage/rules/LR-FIN-DUP-PAY-001/execute 完整四级穿透 ---"
T20=$(curl -s -X POST "$BASE/linkage/rules/LR-FIN-DUP-PAY-001/execute" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'entryEntity':'$INDICATOR_ID'}")")
T20_OK=$(echo "$T20" | python3 -c "
import sys,json
d=json.load(sys.stdin)
rule = d.get('rule') or {}
chain = d.get('chain',[])
# rule.id 正确 + chain 至少含 ads 层 + entry 正确
ok = rule.get('id')=='LR-FIN-DUP-PAY-001' and d.get('entry')=='$INDICATOR_ID' and len(chain)>=1 and chain[0].get('layer')=='ads'
# 数据准备到位时应含 4 层（ads+dws+dwd+ods）
layers = [c.get('layer') for c in chain]
print('1' if ok else '0')
")
T20_LAYERS=$(echo "$T20" | python3 -c "
import sys,json
d=json.load(sys.stdin)
chain=d.get('chain',[])
print(','.join(c.get('layer','?') for c in chain))
")
[ "$T20_OK" = "1" ] && ok "executeRule 返回 rule + chain (layers: $T20_LAYERS)" || no "executeRule" "$T20"

echo "--- T21 验证 chain 含完整四级 (ads,dws,dwd,ods) ---"
T21_OK=$(echo "$T20" | python3 -c "
import sys,json
d=json.load(sys.stdin)
chain=d.get('chain',[])
layers=[c.get('layer') for c in chain]
ok = layers==['ads','dws','dwd','ods']
print('1' if ok else '0')
")
[ "$T21_OK" = "1" ] && ok "完整四级穿透链 ads→dws→dwd→ods" || no "四级链路" "layers=$T20_LAYERS"

echo "--- T22 POST /linkage/rules/LR-FIN-DUP-PAY-001/execute（无 body）→ 400 ---"
T22_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/linkage/rules/LR-FIN-DUP-PAY-001/execute" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
[ "$T22_HTTP" = "400" ] && ok "缺少 entryEntity 返回 400" || no "execute 400" "http=$T22_HTTP"

echo "--- T23 POST /linkage/rules/NONEXISTENT/execute → 404 ---"
T23_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/linkage/rules/LR-NONEXISTENT/execute" -H "$AUTH" -H "Content-Type: application/json" -d "$(json "{'entryEntity':'$INDICATOR_ID'}")")
[ "$T23_HTTP" = "404" ] && ok "不存在规则返回 404" || no "execute 404" "http=$T23_HTTP"

# ============================================================
# Part H：向后兼容（Task 17.7）
# ============================================================
echo ""
echo "=== Part H：向后兼容（Task 17.7 现有 /monitoring/penetration/* 不变） ==="

echo "--- T24 GET /monitoring/penetration/tree 仍可用 ---"
T24_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/monitoring/penetration/tree" -H "$AUTH")
[ "$T24_HTTP" = "200" ] && ok "/monitoring/penetration/tree 仍返回 200" || no "tree 兼容" "http=$T24_HTTP"

echo "--- T25 GET /monitoring/penetration/search?keyword=集团 仍可用 ---"
T25_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/monitoring/penetration/search?keyword=%E9%9B%86%E5%9B%A2" -H "$AUTH")
[ "$T25_HTTP" = "200" ] && ok "/monitoring/penetration/search 仍返回 200" || no "search 兼容" "http=$T25_HTTP"

# ============================================================
# Part I：未鉴权访问应返回 401
# ============================================================
echo ""
echo "=== Part I：未鉴权访问 ==="

echo "--- T26 GET /penetration/ads/ind-dup-1 无 token → 401 ---"
T26_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/penetration/ads/ind-dup-1")
[ "$T26_HTTP" = "401" ] && ok "无 token 访问 /penetration 返回 401" || no "401" "http=$T26_HTTP"

echo "--- T27 GET /linkage/rules 无 token → 401 ---"
T27_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/linkage/rules")
[ "$T27_HTTP" = "401" ] && ok "无 token 访问 /linkage 返回 401" || no "401" "http=$T27_HTTP"

# ============================================================
# 汇总
# ============================================================
echo ""
echo "=========================================="
echo "  Phase 8 E2E 汇总：PASS=$PASS  FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" = "0" ] && echo "✅ 全部通过" || echo "❌ 存在失败"
exit $FAIL
