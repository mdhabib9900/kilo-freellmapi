# FreeLLMAPI Kilo Agent — VS Code v1.70.2+ Extension

Rebuilds **FreeLLMAPI v0.16.9** into a native **Visual Studio Code v1.70.2+** extension combining Kilo Code autonomous multi-mode workflows, universal inline code completions across all languages, a custom High-Visibility UI theme, and the complete FreeLLMAPI local router.

## Features

- **Kilo Code Autonomous Agent (`Ctrl+Shift+A` / `Cmd+Shift+A`)**: Architect, Code, Ask, Debug, and Orchestrator modes with `@file` and `@problems` context and 1-click VS Code Diff preview & Apply.
- **Universal Inline Code Completions (`Alt+\` & Automatic)**: Registered across `{ pattern: '**' }` for all languages, plus `Ctrl+Shift+K` Inline Edit, Lightbulb QuickFix, Refactor, Explain, Optimize, and Unit Test CodeActions.
- **Custom High-Visibility Theme**: `FreeLLMAPI Kilo High-Visibility` color theme engineered for enhanced code and ghost-text readability.
- **Full FreeLLMAPI v0.16.9 Router (`127.0.0.1:3001`)**: All providers (including keyless OVH, Kilo Gateway, and LLM7 out-of-the-box), AES-256-GCM SecretStorage vault, 7 routing strategies (`balanced`, `priority`, `smartest`, `fastest`, `reliable`, `custom`, `decision`), `fusion` multi-model synthesis, sticky sessions & context handoff, prompt compression pipeline, and OpenAI `/v1`, Anthropic `/v1/messages`, Gemini `/v1beta`, Ollama `/api`, and `/mcp` wire protocols.

## Installation

```bash
code --install-extension freellmapi-kilo-vscode-0.16.9.vsix
```
