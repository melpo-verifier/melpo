//============================
//Name        : console_hooks.js
//Usage       : Interception of log functions to add ansi tags and optional auto tracing.
//============================

//Data reference
//----------------------------
//Var   : #cfg.trace_mode - Trace settings.
//0x01    Trace logs(info level).
//0x02    Trace errors(error level).
//0x04    Trace warnings(warn level).
//0x08    Apply prefix tag.
//0       No tracing, only tags.
//Combine these using bitwise or for multiple modes e.x (0x01 | 0x02) for console.log and console.error tracing.
//----------------------------
//Var   : #tag_colors - Colors for ansi terminal(check numbers below for a example compatable with a few terminal types ##m format).
//Black   \x1b[30m
//Red     \x1b[31m
//Green   \x1b[32m
//Yellow  \x1b[33m
//Blue    \x1b[34m
//Magenta \x1b[35m
//Cyan    \x1b[36m
//White   \x1b[37m
//----------------------------

/**
 * console_hooks
 * - Passively hooks console.log, console.error and console.warn
 * - Can be configured to perform automated tracing of console.log, console.error and console.warn
 * - Can if enabled also assign a prefix to assist with context tracing  
 * ***
 * [See file for options](console_hooks.js)
 */
class console_hooks {
    /**
     * Internal configuration vars.  
     * `flags`  - Configuration flags.  
     * `prefix` - String to contain prefix when enabled.  
     */
    static #cfg = {
        //flags: (0x01 | 0x02 | 0x04)   //Stack trace for function names(error and log).
        flags: (0x00 | 0x08),           //Disable stack tracing for function names, use console prefix.
        prefix: ""                      //Console prefix if applicable.
    };

    /**
     * Place a copy to the handle of the original call backs into a list.  
     * ***
     * Note : [Console reference](https://console.spec.whatwg.org/#console-namespace) for standards(log,error and warn).  
     */
    static #def_funcs = {
        con_log: console.log,
        con_err: console.error,
        con_wrn: console.warn
    };

    /**
     * Parameters for ansi spec color selection.  
     * `col_info`  - Info Tag Color.  
     * `col_error` - Error Tag Color.  
     * `col_warn`  - Warning Tag Color.  
     * ***
     * Cite : [Ansi specs](https://en.wikipedia.org/wiki/ANSI_escape_code#3-bit_and_4-bit) for standards  
     * Note : Discord's ansi code block also supports 30-37 [see here](https://gist.github.com/kkrypt0nn/a02506f3712ff2d1c8ca7c9e0aed7c06)  
     */
    static #tag_colors = {
        col_info: "34",
        col_error: "31",
        col_warn: "33"
    };

    //--Interface--

    /**
     * Adds a prefix tag to console events
     * @param {string|optional} prefix tag to assign or clear if empty/not specified
     */
    static SetPrefix(prefix = "") { console_hooks.#cfg.prefix = prefix; }

    //--hooks--
    //Note : Directly call reference to reference functions inside hooks to prevent infinate recursion.
    //Note : Trace logic is repeated inside functions as not to have it effect stack.

    /**
     * Hook : Console.log interception.
     */
    static hook_log() {
        let _args = Array.prototype.slice.call(arguments);                                                   //Convert provided arguements to array.
        //--Start tag prefixing logic--
        {
            let _tag = "[\x1b[" + console_hooks.#tag_colors.col_info + "m";                                  //Write start of tag(set color attribute)
            if (console_hooks.#cfg.flags & 0x01) {
                let _err = new Error(); //Note : Expensive but only way to walk the stack in strict mode.
                console_hooks.#def_funcs.con_log.apply(console, ["[Trace]", _err.stack?.split("\n")[2]]);    //If in trace mode output where this function is called.
                _tag += _err.stack?.split("\n")[2]?.trim().split(" ")[1] + " | ";                            //If in trace mode prefix function name.
            }
            _tag += "info\x1b[0m]";                                                                          //Write end of tag(reset color attribute)
            if ((console_hooks.#cfg.prefix.length > 0) && (console_hooks.#cfg.flags & 0x08))
            { _tag+="["+console_hooks.#cfg.prefix+"]"; }                                                     //Append prefix if enabled and present.
            _args[0] = _tag + _args[0];                                                                      //Append tag to first arguement in array(this keeps log formatting working.)
        }
        //--End tag prefixing logic--

        console_hooks.#def_funcs.con_log.apply(console, _args);
    }

    /**
     * Hook : Console.error interception.
     */
    static hook_err() {
        let _args = Array.prototype.slice.call(arguments);                                                  //Convert provided arguements to array.
        //--Start tag prefixing logic--
        {
            let _tag = "[\x1b[" + console_hooks.#tag_colors.col_error + "m";                                //Write start of tag(set color attribute)
            if (console_hooks.#cfg.flags & 0x02) {
                let _err = new Error(); //Note : Expensive but only way to walk the stack in strict mode.
                console_hooks.#def_funcs.con_err.apply(console, ["[Trace]", _err.stack?.split("\n")[2]]);   //If in trace mode output where this function is called.
                _tag += _err.stack?.split("\n")[2]?.trim().split(" ")[1] + " | ";                           //If in trace mode prefix function name.
            }
            _tag += "error\x1b[0m]";                                                                        //Write end of tag(reset color attribute)
            if ((console_hooks.#cfg.prefix.length > 0) && (console_hooks.#cfg.flags & 0x08))
            { _tag+="["+console_hooks.#cfg.prefix+"]"; }                                                    //Append prefix if enabled and present.
            _args[0] = _tag + _args[0];                                                                     //Append tag to first arguement in array(this keeps log formatting working.)
        }
        //--End tag prefixing logic--

        console_hooks.#def_funcs.con_err.apply(console, _args);
    }

    /**
     * Hook : Console.warn interception.
     */
    static hook_wrn() {
        let _args = Array.prototype.slice.call(arguments);                                                 //Convert provided arguements to array.
        //--Start tag prefixing logic--
        {
            let _tag = "[\x1b[" + console_hooks.#tag_colors.col_warn + "m";                                //Write start of tag(set color attribute)
            if (console_hooks.#cfg.flags & 0x04) {
                let _err = new Error(); //Note : Expensive but only way to walk the stack in strict mode.
                console_hooks.#def_funcs.con_wrn.apply(console, ["[Trace]", _err.stack?.split("\n")[2]]);  //If in trace mode output where this function is called.
                _tag += _err.stack?.split("\n")[2]?.trim().split(" ")[1] + " | ";                          //If in trace mode prefix function name.
            }
            _tag += "warn\x1b[0m]";                                                                        //Write end of tag(reset color attribute)
            if ((console_hooks.#cfg.prefix.length > 0) && (console_hooks.#cfg.flags & 0x08))
            { _tag+="["+console_hooks.#cfg.prefix+"]"; }                                                   //Append prefix if enabled and present.
            _args[0] = _tag + _args[0];                                                                    //Append tag to first arguement in array(this keeps log formatting working.)
        }
        //--End tag prefixing logic--

        console_hooks.#def_funcs.con_wrn.apply(console, _args);
    }

    //Using a static initialisation block here, so when the class is defined it will automatically hook the console object.
    static {
        console.log   = console_hooks.hook_log;
        console.error = console_hooks.hook_err;
        console.warn  = console_hooks.hook_wrn;
    }
}

module.exports=console_hooks;