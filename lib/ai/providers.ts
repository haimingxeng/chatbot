import { customProvider } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

const tokmd = createOpenAICompatible({
  name: "tokmd",
  baseURL: process.env.OPENAI_BASE_URL ?? "https://tok.md/v1",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
  },
});

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  return tokmd(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return tokmd(titleModel.id);
}
