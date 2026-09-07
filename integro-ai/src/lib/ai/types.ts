export type AIProviderKind = 'anthropic' | 'openai' | 'google' | 'custom'

export interface AIProviderSettings {
  provider: AIProviderKind
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface AIProviderMeta {
  id: AIProviderKind
  label: string
  keyPlaceholder: string
  modelLabel: string
  modelPlaceholder: string
  modelRequired: boolean
  baseUrlRequired: boolean
  baseUrlPlaceholder?: string
  docsUrl?: string
  docsLabel?: string
  helpText: string
}

export const AI_PROVIDERS: AIProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    keyPlaceholder: 'sk-ant-...',
    modelLabel: 'Model (optional)',
    modelPlaceholder: 'claude-sonnet-5',
    modelRequired: false,
    baseUrlRequired: false,
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get an Anthropic API key',
    helpText: "Generation runs on your own Anthropic account and billing instead of Integro's. Also the only provider that supports web-research playbooks.",
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-...',
    modelLabel: 'Model',
    modelPlaceholder: 'e.g. gpt-4.1, gpt-4o-mini',
    modelRequired: true,
    baseUrlRequired: false,
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get an OpenAI API key',
    helpText: 'Enter a chat-completions model your OpenAI account has access to.',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    keyPlaceholder: 'AIza...',
    modelLabel: 'Model',
    modelPlaceholder: 'e.g. gemini-2.5-flash, gemini-2.5-pro',
    modelRequired: true,
    baseUrlRequired: false,
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Get a Google AI Studio key',
    helpText: 'Uses the Gemini API directly with your own key.',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    keyPlaceholder: 'Any value if your endpoint does not require a key',
    modelLabel: 'Model',
    modelPlaceholder: 'e.g. llama-3.3-70b, mixtral-8x7b',
    modelRequired: true,
    baseUrlRequired: true,
    baseUrlPlaceholder: 'https://your-endpoint.example.com/v1',
    helpText: 'Any OpenAI-compatible /chat/completions endpoint — Ollama, LM Studio, OpenRouter, Groq, Azure OpenAI, a self-hosted model, and more.',
  },
]

export function providerMeta(id: AIProviderKind): AIProviderMeta {
  return AI_PROVIDERS.find(p => p.id === id) ?? AI_PROVIDERS[0]
}
