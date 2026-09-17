import { ideaHasRequiredTagEvidence, inspectCreativeIdeas, normalizeCreativeIdeaEnvelope, type PrefaceCreativeCandidate, type PrefaceCreativeInput } from "../../../lib/preface-creative-domain";
import { requestPrefaceJson } from "../../../lib/server/preface-creative-ai";
import { containsRestrictedPrefaceAction, PREFACE_AD_SAFETY_CONTRACT } from "../../../lib/preface-ad-safety";

export const runtime = "nodejs";

const systemPrompt = `你是专业海外短剧投放前贴编剧。把用户选中的轻量创意扩写为一条10—15秒完整前贴脚本。严格保留候选中已锁定的维度，不得重新更换核心创意。
0—3秒出现可见动作，3—7秒第一次升级，7—11秒第二次升级，11—15秒只发生一次反转或悬念并自然切入正片。所有动作必须有明确动机并形成连续因果。候选的 scene、coreEvent 和 singleScene 是硬约束：完整前贴只能发生在该单一场景内，围绕同一个重要事件推进，不得切换到第二个地点或另起事件。标题、剧情、关系和动作描述使用中文；对白使用英文，并紧跟中文翻译。角色原名锁定：剧情简介和候选中已有角色名称必须保持原始拼写与文字，不得英译中、中文名英译、音译或改成别名。script 必须按四个时间段连续写成可拍摄正文，具体写清人物站位、视线落点、手部和身体动作、微表情、道具状态、环境变化与动作结果；双语对白必须直接写入 script 的对应时间段，不得把对白留在 script 之外或只放入 dialogue 数组。
候选 tagRealizations 中 priority=required_dramatic 的项目是端到端显影合同，只执行候选实际携带的标签，不得擅自加入其他关系或人设。每项必须在 script 对应时间块中完整呈现：人物可见行动、自然英文对白及中文翻译、另一人物即时反应，使观众无需旁白即可推断标签含义。输出 tagEvidenceLedger，逐项原样保留 tag、axis、priority、dialogueIntent、timeBlock，并填写实际 action、实际 dialogue、reaction、audienceInference；dialogue 必须逐字出现在 script 中。禁止用人物自我介绍、标签解释、手机、账本、账单或屏幕文字代替戏剧化显影。
候选 openingHook 与 endingHook 同为硬约束：开场建立问题，结尾必须保留最后动作、最后对白、即将发生的后果和唯一未回答问题，不得在结尾提前解决。
${PREFACE_AD_SAFETY_CONTRACT}
只输出一个合法JSON对象，顶层字段必须且只能使用 ideas，ideas 必须是只含一条记录的数组。不得使用 idea 单数，不得直接输出脚本对象，不得输出Markdown。
输出结构：{"ideas":[{"title":"中文标题","relationship":"一句话人物关系","audiencePromise":"观众观看承诺","openingAction":"0—3秒可见动作","escalation":["3—7秒升级","7—11秒升级"],"reversalAction":"最后的反转或悬念动作","endingCut":"切入正片的具体动作或画面","suspenseQuestion":"仍未解决的唯一问题","transitionAnchor":"与正片自然承接的位置","script":"完整10—15秒前贴脚本","dialogue":[{"speaker":"角色","english":"English dialogue","translation":"中文翻译"}],"tagEvidenceLedger":[{"tag":"候选标签原名","axis":"relationship|characterSetting","priority":"required_dramatic","action":"实际可见行动","dialogueIntent":"对白透露意图","dialogue":"script中逐字出现的英文对白（中文翻译）","reaction":"即时反应","audienceInference":"观众自然推断","timeBlock":"0-3|3-7|7-11|11-15"}],"shootingNotes":["拍摄重点"],"videoPrompt":"画面生成描述","reusableTemplate":"可复用的抽象叙事模板","productionDifficulty":"低|中|高","score":0}]}。`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { candidate?: PrefaceCreativeCandidate; input?: Partial<PrefaceCreativeInput> };
    if (!body.candidate?.id) return Response.json({ message: "缺少需要扩写的创意候选" }, { status: 400 });
    const originalTask = { selectedCandidate: body.candidate, locks: body.candidate.locks || {}, taskBoundaries: body.input || {} };
    let previousOutput: unknown = null;
    let lastIssue = "模型没有返回可用的完整前贴脚本";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = attempt === 0
        ? JSON.stringify(originalTask)
        : JSON.stringify({ correction: "只修复输出结构和缺失字段，不要更换核心创意。顶层必须是 ideas 数组。", validationFailure: lastIssue, previousOutput, originalTask });
      try {
        const result = await requestPrefaceJson(body.input?.modelProvider, systemPrompt, prompt, 8000, request.signal);
        previousOutput = result.value;
        const inspected = inspectCreativeIdeas(normalizeCreativeIdeaEnvelope(result.value));
        const idea = inspected.ideas[0];
        if (idea && containsRestrictedPrefaceAction(idea.script)) lastIssue = "脚本动作描述触发 TikTok 广告安全合同，包含被禁止的身体距离或接触动作";
        else if (idea && ideaHasRequiredTagEvidence(idea, body.candidate.tagRealizations.filter((item) => item.priority === "required_dramatic"))) return Response.json({ idea: { ...idea, id: body.candidate.id }, model: result.model, provider: result.provider, repaired: attempt > 0 });
        else if (idea) lastIssue = "脚本没有完整执行人物关系/人物设定的行动、对白、反应显影合同，或显影对白未写入正文";
        else lastIssue = inspected.rejections[0]?.reason || "返回内容缺少 ideas、idea 或可识别的脚本对象";
        console.warn("[preface-script] rejected model output", { model: result.model, provider: result.provider, topLevelKeys: Object.keys(result.value).slice(0, 12), reason: lastIssue, attempt: attempt + 1 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "完整脚本生成失败";
        if (attempt === 0 && /JSON|解析/.test(message)) { lastIssue = message; continue; }
        throw error;
      }
    }
    throw new Error(`模型脚本已自动修复一次但仍未通过校验：${lastIssue}`);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "完整脚本生成失败" }, { status: 500 });
  }
}
