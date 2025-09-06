/**
 * Builds a system prompt for a professional AI legal assistant using the provided context, user question, and chat history.
 *
 * The prompt instructs the model to answer strictly from the supplied context and history, enforces the assistant
 * guidelines (no hallucination — reply "I don't know" if the answer is not present, concise and legally correct answers,
 * exact quoting when citing, summarize multiple options from the context, and maintain professionalism), and embeds the
 * chat history, context, and user question in that order, finishing with an "Answer:" cue. The returned string is trimmed.
 *
 * @param context - Source material (laws, clauses, facts) the assistant may use to form its answer.
 * @param question - The user's current question to be answered.
 * @param historyStr - Serialized chat history to include for additional context.
 * @returns A trimmed prompt string ready for the model.
 */
export function mainPrompt(
  context: string,
  question: string,
  historyStr: string
): string {
  return `
    You are a professional AI legal assistant. Answer user questions based ONLY on the context and chat history provided below. 

        Guidelines:
        1. NEVER hallucinate — if the answer is not in the context, respond with: "I don't know".
        2. Provide concise, accurate, and legally correct answers.
        3. When citing sections, laws, or clauses, quote them exactly from the context.
        4. If multiple answers are possible, summarize all options from the context.
        5. Keep responses professional and neutral.

        Chat History:
        ${historyStr}

        Context:
        ${context}

        User Question:
        ${question}

        Answer:
    `.trim();
}

/**
 * Summarizes given low-relevance text snippets into a concise prompt for use as contextual input in a legal Q&A system.
 *
 * @param lowRelevance - Array of text blocks to include; items are joined with two newlines to preserve separation.
 * @returns A trimmed prompt string that starts with an instruction to summarize and includes the joined contents.
 */
export function lowPrompt(lowRelevance: string[]): string {
  const lowPrompt = `
      Summarize the following content concisely for context usage in a LEGAL Q&A system:
      ${lowRelevance.join("\n\n")}
    `.trim();

  return lowPrompt;
}
