/*
File: log.js
Description: Logging functionality.
Author: Mikael Kindborg

License:

Copyright (c) 2013-2015 Mikael Kindborg

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// If window is available, use the window.console object.
exports.log = function(message)
{
	if (typeof window != 'undefined')
	{
		window.console.log(message)
	}
	else if (typeof console != 'undefined')
	{
		console.log(message)
	}
}
