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
			normalizedQuestion.multiSelectNextQuestionId = normalizedQuestion.multiSelectNextQuestionId ?? null;
			normalizedQuestion.otherNextQuestionId = normalizedQuestion.otherNextQuestionId ?? null;
			normalizedQuestion.otherRoles = Array.isArray(normalizedQuestion.otherRoles) ? normalizedQuestion.otherRoles : [];

			const hasExplicitMin =
				normalizedQuestion.minSelections !== undefined && normalizedQuestion.minSelections !== null;
			const hasExplicitMax =
				normalizedQuestion.maxSelections !== undefined && normalizedQuestion.maxSelections !== null;

			if (hasExplicitMin) {
				normalizedQuestion.minSelections = Math.max(1, parseInt(normalizedQuestion.minSelections, 10) || 1);
			} else {
				normalizedQuestion.minSelections = 1;
			}

			if (hasExplicitMax) {
				normalizedQuestion.maxSelections = Math.max(1, parseInt(normalizedQuestion.maxSelections, 10) || 1);
			} else if (normalizedQuestion.allowMultipleSelections === true) {
				// backwards compatibility: allowMultipleSelections without min/max -> max = mcq.length
				normalizedQuestion.maxSelections = normalizedQuestion.mcq.length;
			} else {
				normalizedQuestion.maxSelections = 1;
			}

			// Invariant: maxSelections must be >= minSelections
			if (normalizedQuestion.maxSelections < normalizedQuestion.minSelections) {
				normalizedQuestion.maxSelections = normalizedQuestion.minSelections;
			}

			normalizedQuestion.allowOther = Boolean(normalizedQuestion.allowOther);

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

function buildQuestionFromForm({
	existingQuestion,
	content,
	mcqInput,
	minSelections,
	maxSelections,
	allowOther,
	allowMultipleSelections,
}) {
	const baseQuestion = existingQuestion && typeof existingQuestion === "object" ? { ...existingQuestion } : {};
	const existingMcq = Array.isArray(baseQuestion.mcq) ? baseQuestion.mcq : [];
	const mcq = normalizeMcqInput(mcqInput, existingMcq);

	let parsedMin = 1;
	if (minSelections !== undefined && minSelections !== null) {
		parsedMin = Math.max(1, parseInt(minSelections, 10) || 1);
	} else if (baseQuestion.minSelections !== undefined && baseQuestion.minSelections !== null) {
		parsedMin = Math.max(1, parseInt(baseQuestion.minSelections, 10) || 1);
	}

	let parsedMax = 1;
	if (maxSelections !== undefined && maxSelections !== null) {
		parsedMax = Math.max(1, parseInt(maxSelections, 10) || 1);
	} else if (baseQuestion.maxSelections !== undefined && baseQuestion.maxSelections !== null) {
		parsedMax = Math.max(1, parseInt(baseQuestion.maxSelections, 10) || 1);
	} else if (
		allowMultipleSelections !== undefined
			? Boolean(allowMultipleSelections)
			: baseQuestion.allowMultipleSelections === true
	) {
		parsedMax = Math.max(1, mcq.length);
	}

	if (parsedMax < parsedMin) {
		parsedMax = parsedMin;
	}

	const parsedAllowOther = allowOther !== undefined ? Boolean(allowOther) : Boolean(baseQuestion.allowOther);

	return {
		...baseQuestion,
		id: baseQuestion.id || randomUUID(),
		content,
		mcq,
		minSelections: parsedMin,
		maxSelections: parsedMax,
		allowOther: parsedAllowOther,
		allowMultipleSelections: parsedMax > 1,
		regexBranches: Array.isArray(baseQuestion.regexBranches) ? baseQuestion.regexBranches : [],
		nextQuestionId: baseQuestion.nextQuestionId ?? null,
		multiSelectNextQuestionId: baseQuestion.multiSelectNextQuestionId ?? null,
		otherNextQuestionId: baseQuestion.otherNextQuestionId ?? null,
		otherRoles: Array.isArray(baseQuestion.otherRoles) ? baseQuestion.otherRoles : [],
	};
}

module.exports = { buildQuestionFromForm, normalizeQuestions };
