/** biome-ignore-all lint/complexity/noStaticOnlyClass: This pattern is safe and not obstructing readablity */
//============================
//Name        : CompositeError.js
//Usage       : Wrapper and handler for throwable errors.
//============================

//TODO : Had to temp rename the errors array to errs due to lines 87-95 in js/ErrorHandling.js attempting to iterate a non interatable array(?)

class ErrorCompositor {
	//--Internal values--
	static #njs_format = undefined;
	static #njs_inspect = undefined;

	//--Static setup--
	static {
		//--Import node.js functions--
		const { format, inspect } = require("node:util");
		ErrorCompositor.#njs_format = format;
		ErrorCompositor.#njs_inspect = inspect;
	}

	//--Functions--
	/**
	 * Stack compositing callback for assembling output string.
	 * @param {Array} container A array of error objects to output for debugging.
	 */
	static CompositeStackString(container) {
		//const output = ErrorCompositor.#njs_format("%o\n", container.errors);
		const output = ErrorCompositor.#njs_format("%o\n", container.errs);
		return output;
	}

	/**
	 * Wrapper for setting error mask and pushing an object.
	 * @param {*} err_mask Bit to set in error mask.
	 * @param {*} err_obj Error object to push to the list.
	 */
	static SetAndPush(container, err_mask, err_obj) {
		container.errorMask |= err_mask;
		//container.errors.push(err_obj);
		container.errs.push(err_obj);
	}

	static HasIssue(container) {
		//return container.errors.length > 0;
		return container.errs.length > 0;
	}

	static BuildCompositeError(e_name, e_msg) {
		return {
			name: e_name,
			message: e_msg,
			get stack() {
				//Handles composite reporting to UI end without modification to js/ErrorHandling.js -mat
				return ErrorCompositor.CompositeStackString(this);
			},
			[ErrorCompositor.#njs_inspect.custom](_depth, _options, _inspect) {
				//Handles composite reporting to console object inspection under node.js end without modification to js/ErrorHandling.js - mat
				return ErrorCompositor.CompositeStackString(this);
			},
			errorMask: 0,
			//errors: [],
			errs: [],
		};
	}
}

module.exports = ErrorCompositor;
