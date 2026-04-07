import { createFromSource } from "fumadocs-core/search/server";
import { createTokenizer } from "@orama/tokenizers/mandarin";
import { source } from "@/lib/source";

export const { GET } = createFromSource(source, {
	tokenizer: createTokenizer(),
});
