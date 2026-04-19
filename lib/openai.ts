import OpenAI from "openai";

const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const OPENAI_MODEL = process.env.QWEN_MODEL?.trim() || "qwen-plus";

export function createOpenAIClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_DASHSCOPE_BASE_URL,
  });
}
