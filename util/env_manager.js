/** biome-ignore-all lint/complexity/noStaticOnlyClass: This pattern is safe and not obstructing readablity */
//============================
//Name        : env_manager.js
//Usage       : A container class for wrapping the loading of .env
//============================

//Data reference
//----------------------------
//Var   : #cfg.flags - Flags var.
//0x01    Set upon successfully loading the .env file.
//0x02    Cleared upon an error occuring.
//0x04    Enable environment var caching(Usful for ensuring this class can recall its state across process boundaries).
//----------------------------
//Var   : #cfg.env_name - Environment varrible used to store state, can be changed to prevent namespace conflicts if any.
//----------------------------

/* biome-ignore format: Markdown guard(double spaces are used as newlines in mark down) */
/**
 * env_manager
 * - Handles reading of .env file
 * - Can be set output its state to the environment to persist over boundaries.
 * ***
 * [See file for options](env_manager.js)
 */
class env_manager {
	/* biome-ignore format: Markdown guard(double spaces are used as newlines in mark down) */
	/**
	 * Internal configuration vars:  
	 * `flags`    - Configuration flags.  
	 * `env_name` - Environment varible name to use if environment caching is enabled.  
	 */
	static #cfg = {
		//flags: 0x00 | 0x02,
		flags: 0x00 | 0x02 | 0x04,
		env_name: "EVM_LAST_STATE",
	};

	/**
	 * Attempt to read .env and report error as needed.
	 * @returns {void}
	 */
	static config() {
		// Env cache mode : Run parity check against environment var before running.
		if (env_manager.#cfg.flags & 0x04) {
			// Environment var existing and different from our status?
			if (
				(typeof process.env[env_manager.#cfg.env_name] !== "undefined") 
				&& (env_manager.#cfg.flags !== parseInt(process.env[env_manager.#cfg.env_name], 10)) 
				) {
				env_manager.#cfg.flags = parseInt(process.env[env_manager.#cfg.env_name], 10);
			}
		}

		// If our first load has been done, we do not need to reparse.
		if (!(env_manager.#cfg.flags & 0x01)) {
			//require("dotenv").config();
			try {
				// Try loading the .env and set a flag on success.
				process.loadEnvFile();
				console.log("Loaded .env file.");
				env_manager.#cfg.flags |= 0x01;
			} catch (error) {
				if (env_manager.#cfg.flags & 0x02) {
					console.error("Failed to load .env file.\n", error);

					// Xor off the bit as we have already errored.
					env_manager.#cfg.flags ^= 0x02;
				}
			}
		}

		// Env cache mode : Sync flags to a local environment var so we can track our state inside a child process/inhirreted environment block.
		if (env_manager.#cfg.flags & 0x04) {
			process.env[env_manager.#cfg.env_name] = String(env_manager.#cfg.flags);
		}
	}

	/**
	 * Utility function for checking if a environment var exists.
	 * @param {String} elem Environment var to look for as a string.
	 * @returns {Boolean} True if exists, false otherwise.
	 */
	static has(elem) {
		return (typeof process.env[elem] !== "undefined");
	}
}

module.exports = env_manager;
