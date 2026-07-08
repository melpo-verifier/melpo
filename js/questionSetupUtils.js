const { randomUUID } = require("node:crypto");

function normalizeQuestions(questions) {
	if (!Array.isArray(questions)) return [];

	return questions
		.map((question) => {
			if (typeof question === "string") {
				try {
					question = JSON.parse(question);
				} catch {
					return null;
				}
			}

			if (!question || typeof question !== "object") return null;
			const normalizedQuestion = { ...question };

			normalizedQuestion.id = normalizedQuestion.id || randomUUID();
			normalizedQuestion.content =
				typeof normalizedQuestion.content === "string"
					? normalizedQuestion.content
					: String(normalizedQuestion.content ?? "");
			normalizedQuestion.mcq = normalizeMcqOptions(normalizedQuestion.mcq);
			normalizedQuestion.regexBranches = Array.isArray(normalizedQuestion.regexBranches)
				? normalizedQuestion.regexBranches
				: [];
			normalizedQuestion.nextQuestionId = normalizedQuestion.nextQuestionId ?? null;
			normalizedQuestion.allowMultipleSelections = normalizedQuestion.allowMultipleSelections ?? false;
			normalizedQuestion.multiSelectNextQuestionId = normalizedQuestion.multiSelectNextQuestionId ?? null;

			return normalizedQuestion;
		})
		.filter(Boolean);
}

function normalizeMcqOptions(mcq) {
	if (!Array.isArray(mcq)) return [];

	return mcq.map((option) => {
		if (typeof option === "string") return { id: randomUUID(), label: option, roles: [], nextQuestionId: null };
		if (!option || typeof option !== "object")
			return { id: randomUUID(), label: String(option ?? ""), roles: [], nextQuestionId: null };

		const normalizedOption = { ...option };

		normalizedOption.id = normalizedOption.id || randomUUID();
		normalizedOption.label =
			typeof normalizedOption.label === "string" ? normalizedOption.label : String(normalizedOption.label ?? "");
		normalizedOption.roles = Array.isArray(normalizedOption.roles) ? normalizedOption.roles : [];

		if (!Object.hasOwn(normalizedOption, "nextQuestionId")) normalizedOption.nextQuestionId = null;
		return normalizedOption;
	});
}

function normalizeMcqInput(mcqInput, existingMcq = []) {
	const inputLines = Array.isArray(mcqInput)
		? mcqInput.map((option) => String(option).trim()).filter((option) => option.length > 0)
		: [];

	return inputLines.map((label, index) => {
		const existingOption = normalizeMcqOptions(existingMcq)[index];
		if (existingOption) return { ...existingOption, label };

		return { id: randomUUID(), label, roles: [], nextQuestionId: null };
	});
}

function buildQuestionFromForm({ existingQuestion, content, mcqInput }) {
	const baseQuestion = existingQuestion && typeof existingQuestion === "object" ? { ...existingQuestion } : {};
	const existingMcq = Array.isArray(baseQuestion.mcq) ? baseQuestion.mcq : [];
	const mcq = normalizeMcqInput(mcqInput, existingMcq);

	return {
		...baseQuestion,
		id: baseQuestion.id || randomUUID(),
		content,
		mcq,
		regexBranches: Array.isArray(baseQuestion.regexBranches) ? baseQuestion.regexBranches : [],
		nextQuestionId: baseQuestion.nextQuestionId ?? null,
		allowMultipleSelections: baseQuestion.allowMultipleSelections === true,
		multiSelectNextQuestionId: baseQuestion.multiSelectNextQuestionId ?? null,
	};
}

module.exports = { buildQuestionFromForm, normalizeQuestions };
