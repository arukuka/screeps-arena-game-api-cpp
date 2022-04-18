Module.customJSFunctionToTestClosure = function(firstParam, secondParam) {
	console.log("This function adds two numbers to get", firstParam + secondParam);
}
Module['print'] = function(...data) { console.log(...data) };
Module['printErr'] = function (...data) { console.log(...data) };
Module['locateFile'] = function(path, prefix) { return prefix + path; }
