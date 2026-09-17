import { type PrefaceCreativeIdea, type PrefaceCreativeInput } from "../../../lib/preface-creative-domain";
import { STORYBOARD_SYSTEM_PROMPT } from "../../../lib/preface-storyboard-prompt";
import { extractStoryboardScript } from "../../../lib/preface-storyboard-output";
import { requestPrefaceText } from "../../../lib/server/preface-creative-ai";
import { containsRestrictedPrefaceAction, PREFACE_AD_SAFETY_CONTRACT } from "../../../lib/preface-ad-safety";

export const runtime = "nodejs";

function evidenceCovered(script: string, evidence: PrefaceCreativeIdea["tagEvidenceLedger"]) {
  return evidence.filter((item) => item.priority === "required_dramatic").every((item) => {
    const phrases = [item.action, item.dialogue, item.reaction]
      .flatMap((value) => value.split(/[，。；：,.!?！？;:\n]/))
      .map((value) => value.trim())
      .filter((value) => value.length >= 4);
    return phrases.some((phrase) => script.includes(phrase));
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { idea?: PrefaceCreativeIdea; input?: Partial<PrefaceCreativeInput>; dialogueLanguage?: "英语" | "葡萄牙语" | "西班牙语" };
    if (!body.idea?.id || !body.idea.script.trim()) return Response.json({ message: "缺少可用于生成分镜的前贴脚本" }, { status: 400 });
    const tagEvidenceLedger = body.idea.tagEvidenceLedger || [];
    const dialogueLanguage = body.dialogueLanguage || "英语";
    const basePrompt = `只以以下完整前贴脚本作为剧情原文，生成一条总时长10~15秒、2~4个宏观镜头的分镜脚本。角色名称必须沿用前贴脚本的原始拼写；只输出第二步的分镜脚本，也就是只输出一个分镜脚本，不要输出第一步JSON、原文案段落、分镜脚本2或任何解释。镜头时间使用0—3、3—7、7—11、11—15秒等整秒时间块，不得拆成0.5秒、0.8秒等亚秒镜头。保持前贴脚本的角色关系、核心事件、场景和对白意图，但若出现手机、账单、账本、电脑屏幕、短信或转账记录，不得将屏幕或文字作为视觉重点，可改写为人物当面递交、争夺、撕毁、拦截、指认等可见的肢体行动来承载同一信息。画面必须优先呈现人物正在做什么及动作结果。对白/台词统一使用${dialogueLanguage}；仅翻译对白内容，镜头描述、时间、场景、动作、角色名保持原样。\n\n${PREFACE_AD_SAFETY_CONTRACT}\n\n标签显影台账是硬约束：每个 required_dramatic 标签的 action、dialogue、reaction 必须进入对应宏观镜头，不能改写成解释性旁白，也不能新增未选择的关系或人设。\n标签显影台账：\n${JSON.stringify(tagEvidenceLedger)}\n\n完整前贴脚本：\n${body.idea.script}`;
    let lastResult: Awaited<ReturnType<typeof requestPrefaceText>> | undefined;
    let storyboardScript = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      lastResult = await requestPrefaceText(body.input?.modelProvider, STORYBOARD_SYSTEM_PROMPT, attempt === 0 ? basePrompt : `${basePrompt}\n\n上一次分镜漏掉了标签显影动作、实际对白或人物反应。请重新生成一条分镜，并逐字保留台账中的关键行动、对白和反应。`, 12000, request.signal);
      storyboardScript = extractStoryboardScript(lastResult.value);
      if (!containsRestrictedPrefaceAction(storyboardScript) && evidenceCovered(storyboardScript, tagEvidenceLedger)) break;
    }
    if (!lastResult || containsRestrictedPrefaceAction(storyboardScript) || !evidenceCovered(storyboardScript, tagEvidenceLedger)) throw new Error("分镜未能通过 TikTok 广告安全合同或未完整保留已选人物关系/人物设定显影，请重试");
    return Response.json({ storyboardScript, model: lastResult.model, provider: lastResult.provider });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "分镜脚本生成失败" }, { status: 500 });
  }
}
