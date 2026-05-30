type StreamChatInput = {
  systemPrompt: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
};

type ImageGenerationInput = {
  model: string;
  prompt: string;
};

export type ChatDeltaHandler = (delta: string) => void | Promise<void>;

export async function* streamChatCompletion(
  baseUrl: string,
  apiKey: string,
  input: StreamChatInput
): AsyncGenerator<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      stream: true,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages
      ]
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI provider stream failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        return;
      }

      try {
        const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      } catch {
        continue;
      }
    }
  }
}

export async function generateImageViaProvider(
  baseUrl: string,
  apiKey: string,
  input: ImageGenerationInput
): Promise<{ url: string; providerJobId?: string }> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: "1024x1024"
    })
  });

  if (!response.ok) {
    throw new Error(`Image generation failed with status ${response.status}`);
  }

  const json = (await response.json()) as { data?: Array<{ url?: string; b64_json?: string }>; id?: string };
  const first = json.data?.[0];
  if (!first) {
    throw new Error("Image provider returned no image data");
  }

  if (first.url) {
    return { url: first.url, providerJobId: json.id };
  }

  return { url: `data:image/png;base64,${first.b64_json ?? ""}`, providerJobId: json.id };
}
