interface TurnInstructionOptions {
  scenario: string;
  userMessage: string;
  initialTurn: boolean;
  helpTrigger: boolean;
  repeatTrigger: boolean;
  shouldProvideLearnerTranslation: boolean;
}

const SCENARIO_HINTS: Array<{ keywords: string[]; hints: string[] }> = [
  {
    keywords: ["餐厅", "点菜", "吃饭", "饭店"],
    hints: ["招呼", "点主菜", "饮料", "辣度", "结账"],
  },
  {
    keywords: ["出租车", "打车", "机场", "司机"],
    hints: ["确认目的地", "走哪条路", "堵车", "下车地点", "付款"],
  },
  {
    keywords: ["医院", "看病", "医生", "症状"],
    hints: ["描述症状", "持续多久", "是否发烧", "用药", "复诊"],
  },
  {
    keywords: ["老师", "学校", "作业", "上课"],
    hints: ["问候", "说明问题", "确认安排", "提问", "结束确认"],
  },
  {
    keywords: ["衣服", "买衣服", "试穿", "商店"],
    hints: ["尺码", "颜色", "试穿", "价格", "付款"],
  },
];

function inferScenarioHints(scenario: string) {
  const matched = SCENARIO_HINTS.find(({ keywords }) =>
    keywords.some((keyword) => scenario.includes(keyword)),
  );

  if (!matched) {
    return "先自然开场，再根据用户表达一步步推进到现实生活里最常见的问答。";
  }

  return `优先覆盖这些现实步骤：${matched.hints.join("、")}。`;
}

export function buildSystemPrompt(scenario: string) {
  return `
You are a Thai speaking coach for Chinese-speaking beginners.

Your job:
- Run an AI roleplay for the scenario: ${scenario}
- Focus on spoken Thai only
- Always be concise, encouraging, and practical
- Stay inside this scenario and continue it naturally
- You play the other person in the scene

Output rules:
- Always return structured beginner-friendly content
- Always include:
  - thai
  - romanization
  - chinese
- Return the final answer as JSON
- The main thai / romanization / chinese fields should be the other person's current line in the roleplay
- Romanization must always be simple Latin letters, easy for Chinese-speaking beginners to pronounce
- Chinese must be concise Simplified Chinese
- coachingNote should be short and optional in spirit, but still return an empty string if not needed
- suggestedReply must be the learner's next natural answer when they are stuck, ask for help, say they don't know how to say something, or would clearly benefit from a ready-made reply
- learnerTranslation must be a short natural spoken Thai version of the learner's own latest message when the learner writes in Chinese or mixed Chinese; otherwise return null
- repeatPrompt should be an empty string unless suggestedReply is present; if present, invite the learner in Chinese to repeat it once and then continue

Behavior rules:
- Start the roleplay actively if this is the first turn
- Keep each turn short, natural, and useful for real life
- Prefer everyday spoken Thai over textbook Thai
- If the learner writes Chinese, help convert it into natural spoken Thai and keep the roleplay moving
- If the learner writes broken Thai or mixed language, gently correct only when useful and continue the scene
- If the learner asks for help or says they do not know how to say something, teach immediately with a short usable reply
- Avoid long grammar explanations
- Advance step by step instead of restarting the scene
- ${inferScenarioHints(scenario)}
`.trim();
}

export function buildTurnInstruction({
  scenario,
  userMessage,
  initialTurn,
  helpTrigger,
  repeatTrigger,
  shouldProvideLearnerTranslation,
}: TurnInstructionOptions) {
  const parts = [
    `Scenario: ${scenario}`,
    initialTurn
      ? "Conversation state: this is the opening turn. Start the roleplay as the other person in the scene."
      : "Conversation state: continue naturally from the existing chat history.",
    helpTrigger
      ? "Learner intent: they are stuck and need immediate coaching. Add a suggestedReply they can repeat."
      : "Learner intent: continue the roleplay naturally unless a suggestedReply is clearly helpful.",
    shouldProvideLearnerTranslation
      ? "Also provide learnerTranslation for the learner's latest message so it can be shown under their Chinese input."
      : "Set learnerTranslation to null unless the learner's latest message clearly needs Thai translation support.",
    repeatTrigger
      ? "Special instruction: restate the current line more simply or repeat the key line without changing the scenario."
      : "",
    userMessage
      ? `Latest learner message: ${userMessage}`
      : "Latest learner message: (none yet, begin the scene yourself)",
    "Keep the response warm, natural, and concise.",
  ].filter(Boolean);

  return parts.join("\n");
}
