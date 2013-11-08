/*
File: hyper-server.js
Description: HyperReload server functionality.
Author: Mikael Kindborg
Copyright (c) 2013 Mikael Kindborg
*/

/*** Modules used ***/

var WEBSERVER = require('./webserver')
var SOCKETIO = require('socket.io')
var FS = require('fs')
var PATH = require('path')
var FILEUTIL = require('./fileutil.js')
var SETTINGS = require('../settings/settings.js')

/*********************************/
/***	   Server code		   ***/
/*********************************/

/*** Server variables ***/

var mWebServer
var mIO
var mBasePath
var mAppPath
var mAppFile
var mIpAddress
var mMessageCallback = null
var mClientConnectedCallback = null
var mReloadCallback = null

/*** Server functions ***/

/**
 * Internal.
 */
function startWebServer(basePath, port, fun)
{
	var server = WEBSERVER.create()
	server.setBasePath(basePath)
	server.start(port)
	fun(server)
}

/**
 * NOT USED.
 *
 * Internal.
 *
 * Version of webserver hook function used for serving iframe version.
 */
/*
function webServerHookFunForIframe(request, response, path)
{
	// When the root is requested, we send the document with an
	// iframe that will load application pages.
	if (path == '/')
	{
		var page = FS.readFileSync('./hyper/server/hyper-client.html', {encoding: 'utf8'})
		mWebServer.writeRespose(response, page, 'text/html')
		return true
	}
	else
	{
		return false
	}
}
*/

/**
 * Internal.
 *
 * Version of the webserver hook function that inserts the reloader
 * script on each HTML page requested.
 */
function webServerHookFunForScriptInjection(request, response, path)
{
	//console.log('webServerHookFun path: ' + path)
	if (path == '/')
	{
		// If the root path is requested, send the connect page.
		var file = FILEUTIL.readFileSync('./hyper/server/hyper-connect.html')
		if (file)
		{
			file = insertReloaderScript(file, request)
			mWebServer.writeRespose(response, file, 'text/html')
			return true
		}
		else
		{
			return false
		}
	}
	else if (path == '/hyper.reloader')
	{
		// Send reloader script.
		var script = FILEUTIL.readFileSync('./hyper/server/hyper-reloader.js')
		if (script)
		{
			script = script.replace(
				'__SOCKET_IO_PORT_INSERTED_BY_SERVER__',
				SETTINGS.SocketIoPort)
			mWebServer.writeRespose(response, script, 'application/javascript')
			return true
		}
		else
		{
			return false
		}
	}
	else if (SETTINGS.ServeCordovaJsFiles &&
		(path == '/cordova.js' ||
		path == '/cordova_plugins.js' ||
		path.indexOf('/plugins/') == 0))
	{
		// iOS is default platform.
		var platformPath = './hyper/libs-cordova/ios'

		// Check for Android.
		if (request['headers']['user-agent'].indexOf('Android') > 0)
		{
			platformPath = './hyper/libs-cordova/android'
		}
		//console.log('path1: ' + path)
		//console.log('path2: ' + platformPath + path)
		var script = FILEUTIL.readFileSync(platformPath + path)
		if (script)
		{
			mWebServer.writeRespose(response, script, 'application/javascript')
			return true
		}
		else
		{
			return false
		}
	}
	else if (mBasePath && FILEUTIL.fileIsHTML(path))
	{
		// Insert reloader script into HTML page.
		var filePath = mBasePath + path.substr(1)
		var file = FILEUTIL.readFileSync(filePath)
		if (file)
		{
			file = insertReloaderScript(file, request)
			mWebServer.writeRespose(response, file, 'text/html')
			return true
		}
		else
		{
			return false
		}
	}
	else
	{
		// Use default processing for all other pages.
		return false
	}
}

/**
 * Internal.
 *
 * Return script tags for reload functionality.
 */
function createReloaderScriptTags(address)
{
	return '' +
		'<script src="http://' + address +
		':' + SETTINGS.SocketIoPort +
		'/socket.io/socket.io.js"></script>' +
		'<script src="/hyper.reloader"></script>'
}

/**
 * Internal.
 *
 * Insert the script at the template tag, if no template tag is
 * found, insert at alternative locations in the document.
 *
 * It is desirable to have script tags inserted as early as possible,
 * to enable hyper.log and error reportning during document loading.
 */
function insertReloaderScript(file, request)
{
	var host = request.headers.host
	var address = host.substr(0, host.indexOf(':'))
	//console.log('address ' + address)
	var script = createReloaderScriptTags(address)

	// Is there a template tag? In that case, insert script there.
	var hasTemplateTag = (-1 != file.indexOf('<!--hyper.reloader-->'))
	if (hasTemplateTag)
	{
		return file.replace('<!--hyper.reloader-->', script)
	}

	// Insert after title tag.
	var pos = file.indexOf('</title>')
	if (pos > -1)
	{
		return file.replace('</title>', '</title>' + script)
	}

	// Insert last in head.
	var pos = file.indexOf('</head>')
	if (pos > -1)
	{
		return file.replace('</head>', script + '</head>')
	}

	// Fallback: Insert first in body.
	// TODO: Rewrite to use regular expressions to capture more cases.
	pos = file.indexOf('<body>')
	if (pos > -1)
	{
		return file.replace('<body>', '<body>' + script)
	}

	// Insert last in body.
	pos = file.indexOf('</body>')
	if (pos > -1)
	{
		return file.replace('</body>', script + '</body>')
	}
}

/**
 * External.
 */
function startServers()
{
	console.log('Starting servers')

	// Start socket.io server.
	// TODO: Move to a separate function for clarity.

	//mIO = SOCKETIO.listen(SETTINGS.SocketIoPort, {log: false})
	mIO = SOCKETIO.listen(SETTINGS.SocketIoPort)

	mIO.set('log level', 1)
	mIO.set('close timeout', 60 * 60 * 24)
	mIO.set('transports', ['xhr-polling'])
	mIO.set('browser client minification', true)
	mIO.set('polling duration', 5)

	// Handle socket connections.
	mIO.sockets.on('connection', function(socket)
	{
		// Debug logging.
		console.log('Client connected')

		socket.on('disconnect', function ()
		{
			// Debug logging.
			console.log('Client disconnected')
		})

		socket.on('hyper.client-connected', function(data)
		{
			// Debug logging.
			console.log('hyper.client-connected')

			mClientConnectedCallback && mClientConnectedCallback()
		})

		socket.on('hyper.log', function(data)
		{
			displayLogMessage(data)
		})

		socket.on('hyper.result', function(data)
		{
			//console.log('data result type: ' + (typeof data))
			//console.log('data result : ' + data)

			// Functions cause a cloning error.
			if (typeof data == 'function')
			{
				data = typeof data
			}
			displayJsResult(data)
		})

		// Closure that holds socket connection.
		/*(function(socket)
		{
			//mSockets.push_back(socket)
			//socket.emit('news', { hello: 'world' });
			socket.on('unregister', function(data)
			{
				mSockets.remove(socket)
			})
		})(socket)*/
	})

	// Start web server.

	startWebServer(mBasePath, SETTINGS.WebServerPort, function(server)
	{
		mWebServer = server
		mWebServer.getIpAddress(function(address)
		{
			mIpAddress = ensureIpAddress(address)
		})
		mWebServer.setHookFun(webServerHookFunForScriptInjection)
	})
}

/**
 * External.
 */
function getWebServerIpAndPort(fun)
{
	mWebServer.getIpAddress(function(address)
	{
		fun(ensureIpAddress(address), SETTINGS.WebServerPort)
	})
}

/**
 * External.
 */
function setAppPath(appPath)
{
	if (appPath != mAppPath)
	{
		mAppPath = appPath
		var pos = mAppPath.lastIndexOf(PATH.sep) + 1
		mBasePath = mAppPath.substr(0, pos)
		mAppFile = mAppPath.substr(pos)
		mWebServer.setBasePath(mBasePath)
	}
}

/**
 * External.
 * Return the name of the main HTML file of the application.
 */
function getAppFileName()
{
	return mAppFile
}

/**
 * External.
 */
function getAppFileURL()
{
	return 'http://' + mIpAddress + ':' + SETTINGS.WebServerPort + '/' + mAppFile
}

/**
 * External.
 */
function getServerBaseURL()
{
	return 'http://' + mIpAddress + ':' + SETTINGS.WebServerPort + '/'
}

/**
 * External.
 * Reloads the main HTML file of the current app.
 */
function runApp()
{
	mIO.sockets.emit('hyper.run', {url: getAppFileURL()})
}

/**
 * External.
 * Reloads the currently visible page of the browser.
 */
function reloadApp()
{
	mIO.sockets.emit('hyper.reload', {})
	mReloadCallback && mReloadCallback()
}

/**
 * External.
 */
function evalJS(code)
{
	mIO.sockets.emit('hyper.eval', code)
}

/**
 * External.
 *
 * Callback form: fun(object)
 */
function setMessageCallbackFun(fun)
{
	mMessageCallback = fun
}

/**
 * External.
 *
 * Callback form: fun()
 */
function setClientConnenctedCallbackFun(fun)
{
	mClientConnectedCallback = fun
}

/**
 * External.
 *
 * Callback form: fun()
 */
function setReloadCallbackFun(fun)
{
	mReloadCallback = fun
}

/**
 * Internal.
 */
function ensureIpAddress(address)
{
	return address || '127.0.0.1'
}

/**
 * Internal.
 */
function displayLogMessage(message)
{
	if (mMessageCallback)
	{
		mMessageCallback({ message: 'hyper.log', logMessage: message })
	}
}

/**
 * Internal.
 */
function displayJsResult(result)
{
	if (mMessageCallback)
	{
		mMessageCallback({ message: 'hyper.result', result: result })
	}
}

// Display version info.
//document.querySelector('#info').innerHTML = 'node.js ' + process.version


/*********************************/
/*** Hot reload on file update ***/
/*********************************/

/*** File traversal variables ***/

var mLastReloadTime = Date.now()
var mTraverseNumDirecoryLevels = 0
var mFileCounter = 0
var mNumberOfMonitoredFiles = 0

/*** File traversal functions ***/

/**
 * External.
 */
function setTraverseNumDirectoryLevels(levels)
{
	mTraverseNumDirecoryLevels = levels
}

/**
 * External.
 */
function getNumberOfMonitoredFiles()
{
	return mNumberOfMonitoredFiles
}

/**
 * External.
 */
function fileSystemMonitor()
{
	mFileCounter = 0
	var filesUpdated = fileSystemMonitorWorker(
		mBasePath,
		mTraverseNumDirecoryLevels)
	if (filesUpdated)
	{
		reloadApp()
		setTimeout(fileSystemMonitor, 1000)
	}
	else
	{
		mNumberOfMonitoredFiles = mFileCounter
		setTimeout(fileSystemMonitor, 500)
	}
}

/**
 * Internal.
 * Return true if a file ahs been updated, otherwise false.
 */
function fileSystemMonitorWorker(path, level)
{
	//console.log('fileSystemMonitorWorker path:level: ' + path + ':' + level)
	if (!path) { return false }
	try
	{
		/*var files = FS.readdirSync(path)
		for (var i in files)
		{
			console.log(path + files[i])
		}
		return false*/

		var files = FS.readdirSync(path)
		for (var i in files)
		{
			try
			{
				var stat = FS.statSync(path + files[i])
				var t = stat.mtime.getTime()

				if (stat.isFile())
				{
					++mFileCounter
				}

				//console.log('Checking file: ' + files[i] + ': ' + stat.mtime)
				if (stat.isFile() && t > mLastReloadTime)
				{
					//console.log('***** File has changed ***** ' + files[i])
					mLastReloadTime = Date.now()
					return true
				}
				else if (stat.isDirectory() && level > 0)
				{
					//console.log('Decending into: ' + path + files[i])
					var changed = fileSystemMonitorWorker(
						path + files[i] + PATH.sep,
						level - 1)
					if (changed) { return true }
				}
			}
			catch (err2)
			{
				console.log('***** ERROR2 fileSystemMonitorWorker ****** ' + err2)
			}
		}
	}
	catch(err1)
	{
		console.log('***** ERROR1 fileSystemMonitorWorker ****** ' + err1)
	}
	return false
}

/*console.log(mBasePath)
var files = FS.readdirSync(mBasePath)
for (var i in files)
{
	console.log(files[i])
}*/

/*********************************/
/***	  Module exports	   ***/
/*********************************/

exports.startServers = startServers
exports.getWebServerIpAndPort = getWebServerIpAndPort
exports.setAppPath = setAppPath
exports.getAppFileName = getAppFileName
exports.getAppFileURL = getAppFileURL
exports.getServerBaseURL = getServerBaseURL
exports.runApp = runApp
exports.reloadApp = reloadApp
exports.evalJS = evalJS
exports.setMessageCallbackFun = setMessageCallbackFun
exports.setClientConnenctedCallbackFun = setClientConnenctedCallbackFun
exports.setReloadCallbackFun = setReloadCallbackFun
exports.setTraverseNumDirectoryLevels = setTraverseNumDirectoryLevels
exports.getNumberOfMonitoredFiles = getNumberOfMonitoredFiles
exports.fileSystemMonitor = fileSystemMonitor