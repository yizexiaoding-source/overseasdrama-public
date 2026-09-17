/** Shared ad-safety contract for overseas short-drama preface generation. */
export const PREFACE_AD_SAFETY_CONTRACT = `TikTok广告投放安全合同（硬约束）：动作描述中禁止出现亲吻、接吻、嘴和嘴靠近或贴合、腿和腿靠近或贴合、脸和脸靠近或贴合、上半身与上半身近距离贴合、下半身与下半身近距离贴合、贴耳说话或耳边低语。不得用同义改写、暧昧化措辞或镜头调度规避该限制。冲突和情绪必须通过安全距离内的站位、手部动作、道具争夺、视线、表情、声音和空间阻隔来表现。对白可以表达紧张关系，但不得要求或描述上述身体接触动作。`;

const restrictedActionPattern = /(?:亲吻|接吻|嘴(?:和|与)?嘴.{0,8}(?:近|贴|碰)|嘴唇.{0,8}(?:近|贴|碰)|腿(?:和|与)?腿.{0,8}(?:近|贴|碰)|双腿.{0,8}(?:近|贴|碰)|脸(?:和|与)?脸.{0,8}(?:近|贴|碰)|贴脸|上半身.{0,10}(?:近|贴|碰)|下半身.{0,10}(?:近|贴|碰)|贴耳|耳边低语|附耳说)/i;

/** Returns true when generated visual/action copy contains a prohibited intimacy cue. */
export function containsRestrictedPrefaceAction(value: unknown): boolean {
  return typeof value === "string" && restrictedActionPattern.test(value);
}
