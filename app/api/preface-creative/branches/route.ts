import { creativeTaskAllowsSpeculativeElements, inspectCreativeCandidates, type PrefaceBranchSpec, type PrefaceCreativeCandidate, type PrefaceCreativeInput } from "../../../lib/preface-creative-domain";
import { candidateHasRequiredDramaticEvidence } from "../../../lib/preface-creative-generation";
import { requestPrefaceJson } from "../../../lib/server/preface-creative-ai";

export const runtime = "nodejs";

const systemPrompt = `你是海外短剧前15秒创意分支策划师。基于一条母候选生成三个真正不同的轻量候选：稳健放大、关系迁移、想象跃迁。必须继承用户锁定维度；未锁定的人物关系、动作、场景、冲突与反转可以重构。差异来自冲突结构和人物选择；非常规元素可以服务于题材、世界观和戏剧冲突，但必须有明确因果，人物关系必须让普通观众在3秒内理解。角色原名锁定：剧情简介、母候选和任务边界中已经出现的角色名称必须原样保留，不得英译中、中文名英译、音译或改成别名。
每条必须形成五步因果链：触发事件 → 主体行动 → 阻碍或升级 → 主体再次行动 → 未解决问题。每条只能在单一场景中发生一个重要事件，15秒内不得切换地点或另起事件。title 必须是6—14个中文字符的核心事件短标题，只点名事件；scene 是唯一场景，coreEvent 是唯一重要事件，singleScene 必须为 true。每条必须继续使用任务允许的至少两个内容标签和至少一个用户已选钩子，并分别给出 usedTags、usedHooks 使用证据。logicScore≥75、familiarityScore≥75、genreFitScore≥80、productionFeasibilityScore≥70，不合格时输出前自行重写。标题、剧情和动作使用中文。
母候选 tagRealizations 中 required_dramatic 项必须继续执行，只能改写具体动作与对白，不能删掉标签，也不能添加用户未选的人物关系或人物设定。每项仍须包含 action、dialogueIntent、reaction、audienceInference、timeBlock；用动作和自然对白显露标签，不得写人物说明书。母候选 openingHook 与 endingHook 也必须完整保留为一对首尾钩子。禁止手机、账本、账单、电脑屏幕或屏幕文字作为视觉重点，必须改为观众无需阅读文字即可看懂的人物行动。
只输出JSON：{"candidates":[{"id":"","parentId":"","generationSlot":"branch-1","lane":"anchored|migrated|wild","title":"核心事件短标题","sceneFamily":"私密关系|公开压力|权力交易|离开阻拦|危机处理|仪式社交","scene":"唯一场景","coreEvent":"唯一重要事件","singleScene":true,"premise":"","openingAction":"","escalation":["",""],"endingQuestion":"","audiencePromise":"","hookMechanism":"","relationshipPattern":"","conflictSource":"","twistType":"","emotion":"","worldRules":"","productionDifficulty":"低|中|高","adPotential":0,"noveltyScore":0,"causalChain":["触发事件","主体行动","阻碍或升级","主体再次行动","未解决问题"],"usedTags":[{"tag":"允许标签","evidence":"剧情体现"}],"tagRealizations":[{"tag":"母候选标签原名","axis":"relationship|characterSetting","priority":"required_dramatic","action":"","dialogueIntent":"","reaction":"","audienceInference":"","timeBlock":"0-3|3-7|7-11|11-15"}],"openingHook":{"type":"","visibleAction":"","firstQuestion":""},"endingHook":{"type":"","lastVisibleAction":"","lastDialogue":"","imminentConsequence":"","unansweredQuestion":"","handoffVisual":""},"usedHooks":[{"hook":"已选钩子","role":"主钩子|辅助钩子","stage":"开场|升级|结尾","evidence":"剧情体现"}],"unusualElements":[],"logicScore":0,"familiarityScore":0,"genreFitScore":0,"productionFeasibilityScore":0,"fingerprint":{"relationship":"","goal":"","conflictSource":"","location":"唯一场景","openingAction":"","keyObject":"","hookMechanism":"","twistType":"","endingQuestion":"","handoff":""},"locks":{},"riskNotes":[]}]}。必须恰好三条，顺序为稳健放大、关系迁移、想象跃迁。`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { candidate?: PrefaceCreativeCandidate; input?: Partial<PrefaceCreativeInput>; branchSpecs?: PrefaceBranchSpec[] };
    if (!body.candidate?.id) return Response.json({ message: "缺少需要生成分支的母候选" }, { status: 400 });
    const task = body.input || {};
    const allowedTags = [...new Set([task.genre, ...(task.genreTags || []), ...(task.worldViewTags || []), ...(task.relationshipTags || []), ...(task.characterSettingTags || []), ...(task.lockedTags || []), ...(task.aiRecommendedTags || [])].map(String).map((item) => item.trim()).filter(Boolean))].filter((item) => !(task.excludedTags || []).includes(item));
    const selectedHooks = task.hookStrategyPlan?.selectedHooks?.map((item) => item.label) || body.candidate.usedHooks.map((item) => item.hook);
    const requiredDramaticTags = body.candidate.tagRealizations.filter((item) => item.priority === "required_dramatic").map((item) => item.tag);
    const originalRequest = JSON.stringify({ parentCandidate: body.candidate, locks: body.candidate.locks || {}, taskBoundaries: task, allowedTags, selectedHooks, branchSpecs: body.branchSpecs || [] });
    const branchSpecs = Array.isArray(body.branchSpecs) && body.branchSpecs.length === 3 ? body.branchSpecs : undefined;
    if (branchSpecs) {
      const branchResults = await Promise.allSettled(branchSpecs.map(async (spec, index) => {
        const prompt = `${systemPrompt}\n本次只生成一个分支，方向为：${spec.direction}；变化强度：${spec.intensity}；必须保留：${spec.preserve.join("、")}。只输出 candidates 数组中的一条。`;
        let branchResult = await requestPrefaceJson(body.input?.modelProvider, prompt, `${originalRequest}\n当前分支序号：${index + 1}`, 5000, request.signal);
        let branchInspection = inspectCreativeCandidates(branchResult.value.candidates, { allowSpeculative: creativeTaskAllowsSpeculativeElements(task), allowedTags, selectedHooks });
        branchInspection.candidates = branchInspection.candidates.filter((candidate) => candidateHasRequiredDramaticEvidence(candidate, requiredDramaticTags));
        if (!branchInspection.candidates.length) {
          branchResult = await requestPrefaceJson(body.input?.modelProvider, prompt, `${originalRequest}\n上一条分支不合格：${branchInspection.rejections.map((item) => item.reason).join("；")}。请改成纯人物行动和自然对白，不要使用屏幕、账单或账本。`, 5000, request.signal);
          branchInspection = inspectCreativeCandidates(branchResult.value.candidates, { allowSpeculative: creativeTaskAllowsSpeculativeElements(task), allowedTags, selectedHooks });
          branchInspection.candidates = branchInspection.candidates.filter((candidate) => candidateHasRequiredDramaticEvidence(candidate, requiredDramaticTags));
        }
        if (!branchInspection.candidates.length) throw new Error(branchInspection.rejections.map((item) => item.reason).join("；") || "该分支未通过校验");
        return branchInspection.candidates[0];
      }));
      const successful = branchResults.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
      if (successful.length !== 3) throw new Error(`仅 ${successful.length}/3 个变体通过校验，请重试失败分支`);
      const branchRunId = Date.now().toString(36);
      return Response.json({ candidates: successful.map((item, index) => ({ ...item, id: `${body.candidate!.id}-branch-${branchRunId}-${index + 1}`, parentId: body.candidate!.id, locks: { ...body.candidate!.locks } })) });
    }
    let result = await requestPrefaceJson(body.input?.modelProvider, systemPrompt, originalRequest, 8000, request.signal);
    let inspected = inspectCreativeCandidates(result.value.candidates, { allowSpeculative: creativeTaskAllowsSpeculativeElements(task), allowedTags, selectedHooks });
    inspected.candidates = inspected.candidates.filter((candidate) => candidateHasRequiredDramaticEvidence(candidate, requiredDramaticTags));
    if (inspected.candidates.length !== 3) {
      const rejectionSummary = inspected.rejections.map((item) => `${item.id || "未命名分支"}：${item.reason}`).join("；") || `仅通过 ${inspected.candidates.length}/3 条`;
      result = await requestPrefaceJson(body.input?.modelProvider, systemPrompt, `${originalRequest}\n\n上一次输出未通过结构校验：${rejectionSummary}。请重新输出完整的三条候选，不要解释，不要沿用被拒绝的结构。`, 8000, request.signal);
      inspected = inspectCreativeCandidates(result.value.candidates, { allowSpeculative: creativeTaskAllowsSpeculativeElements(task), allowedTags, selectedHooks });
      inspected.candidates = inspected.candidates.filter((candidate) => candidateHasRequiredDramaticEvidence(candidate, requiredDramaticTags));
    }
    const branchRunId = Date.now().toString(36);
    const candidates = inspected.candidates.slice(0, 3).map((item, index) => ({ ...item, id: `${body.candidate!.id}-branch-${branchRunId}-${index + 1}`, parentId: body.candidate!.id, locks: { ...body.candidate!.locks } }));
    if (candidates.length !== 3) throw new Error(inspected.rejections.map((item) => item.reason).join("；") || "模型没有返回完整的三个创意分支");
    return Response.json({ candidates, model: result.model, provider: result.provider });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "创意分支生成失败" }, { status: 500 });
  }
}
