/**
 * Image-block filter for `convertToLlm`.
 *
 * When the user enables "block images" in settings, the LLM should never
 * see the raw bytes of an image — it would burn through tokens and might
 * leak private data. This filter walks the converted messages and replaces
 * any image content blocks with the placeholder text "Image reading is
 * disabled." (deduped when consecutive).
 *
 * The filter is wired into the agent's `convertToLlm` callback in
 * `core/sdk.ts` so that toggling the setting at runtime takes effect
 * immediately without rebuilding the agent.
 */

import type { AgentMessage } from "@simpletoolsindiaorg/ai-agent";
import type { Message } from "@simpletoolsindiaorg/ai-provider";

const DISABLED_TEXT = "Image reading is disabled.";

function isDisabledText(value: string): boolean {
	return value === DISABLED_TEXT;
}

/**
 * Returns a `convertToLlm` function that filters images from the
 * converted output when `isBlocked` returns true. Pass a function
 * (not a value) so the runtime check picks up live settings changes
 * without recreating the convert callback.
 */
export function withImageBlock(
	convert: (messages: AgentMessage[]) => Message[],
	isBlocked: () => boolean,
): (messages: AgentMessage[]) => Message[] {
	return (messages) => {
		const converted = convert(messages);
		if (!isBlocked()) {
			return converted;
		}
		return converted.map(stripImagesFromMessage);
	};
}

/**
 * Replace any image content in a single message with the
 * disabled-text placeholder. Consecutive placeholders are deduped.
 */
function stripImagesFromMessage(msg: Message): Message {
	if (msg.role !== "user" && msg.role !== "toolResult") {
		return msg;
	}
	const content = msg.content;
	if (!Array.isArray(content)) {
		return msg;
	}
	const hasImage = content.some((c) => c.type === "image");
	if (!hasImage) {
		return msg;
	}
	const filtered = content
		.map((c) => (c.type === "image" ? { type: "text" as const, text: DISABLED_TEXT } : c))
		.filter(
			(c, i, arr) =>
				!(
					c.type === "text" &&
					isDisabledText(c.text) &&
					i > 0 &&
					arr[i - 1].type === "text" &&
					isDisabledText((arr[i - 1] as { type: "text"; text: string }).text)
				),
		);
	return { ...msg, content: filtered };
}
