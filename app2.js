// Entry point for the app jl.
const { exit } = require('process')
const { logger, httpLogger } = require('./logger')
const pjson = require('./package.json')
const VersionService = require('./modules/VersionService')
VersionService.updateVersionInAtlassianConnect(pjson.version)
  .then(() => {
  // // Express is the underlying web framework: https://expressjs.com
    const express = require('express')

    // https://expressjs.com/en/guide/using-middleware.html TEST
    const bodyParser = require('body-parser')
    const compression = require('compression')
    const cookieParser = require('cookie-parser')
    const morgan = require('morgan')
    const hbs = require('express-hbs')
    const errorhandler = require('errorhandler')

    // atlassian-connect-express also provides a middleware
    const ace = require('atlassian-connect-express')

    // We also need a few stock Node modules
    const http = require('http')
    const path = require('path') // test 2 edited

    // added new lines

    // Routes live here; this is the C in MVC
    const routes = require('./routes')
    const events = require('./events')
    const ConfigParameters = require('./modules/ConfigParameters')

    // Bootstrap Express and atlassian-connect-express
    const app = express()
    const app2 = express()
    const app3 = express()
    const addon = ace(app, {
      config: {
        descriptorTransformer: (descriptor, config) => {
        // make descriptor transformations here
          return descriptor
        }
      }
    })

    // Add security headers.
    app.use(function (req, res, next) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        next()
    })

    // See config.json
    const port = addon.config.port()
    app.set('port', port)

    // Static expiry middleware to help serve static resources efficiently
    process.env.PWD = process.env.PWD || process.cwd() // Fix expiry on Windows :(
    const expiry = require('static-expiry')

    const viewsDir = path.resolve(__dirname, 'views')
    app.engine('hbs', hbs.express4({ partialsDir: viewsDir }))
    app.set('view engine', 'hbs')
    app.set('views', viewsDir)
    hbs.registerHelper('furl', function (url) { return app.locals.furl(url) })

    // Log requests, using an appropriate formatter by env
    const devEnv = app.get('env') === 'development'
    if (devEnv === 'development') {
    // only use in development
      app.use(errorhandler())
    }
    app.use(morgan(devEnv ? 'dev' : 'combined'))

    // Include request parsers
    app.use(bodyParser.urlencoded({ extended: false }))
    app.use(bodyParser.json({
      limit: '1mb'
    }))
    app.use(cookieParser())
    app.use(httpLogger)

    // Gzip responses when appropriate
    app.use(compression())

    // Use api.bitbucket.org instead of the deprecated bitbucket.org/api
    app.post('/installed', function (req, res, next) {
      req.body.baseUrl = req.body.baseApiUrl
      next('route')
    })

    // Include atlassian-connect-express middleware
    app.use(addon.middleware())

    const staticDir = path.join(__dirname, 'public')
    // Enable static resource fingerprinting for far future expires caching in production
    app.use(expiry(app, { dir: staticDir, debug: devEnv }))

    // Mount the static files directory
    // Anything in ./public is served up as static content
    app.use(express.static(staticDir))

    // Enable static resource fingerprinting for far future expires caching in production
    app.use(expiry(app, { dir: staticDir, debug: devEnv }))
    // Add an hbs helper to fingerprint static resource urls
    if (devEnv === 'development') {
      hbs.registerHelper('furl', function (url) { return url })
    } else {
      hbs.registerHelper('furl', function (url) { return app.locals.furl(url) })
    }
    // Set no-referrer header on all requests
    app.use(function (req, res, next) {
      res.setHeader('Referrer-Policy', 'origin')
      return next()
    })
    // Show nicer errors in dev mode
    // if (devEnv) app.use(errorHandler());
    // Wire up app events
    events(addon)
    // Wire up routes
    routes(app, addon)
    if (!ConfigParameters.allParametersExist(addon)) {
      exit(1)
    }

    // Boot the HTTP server
    http.createServer(app).listen(port, () => {
      logger.info({ clientkey: 'app', message: 'App server running at ' + addon.config.localBaseUrl() })
      app.locals.addon = addon
      app.locals.url = addon.config.localBaseUrl()
    })

    http.createServer(app2).listen(8081, () => {
    })
    http.createServer(app3).listen(8082, () => {
    })
  }).catch((err) => {
    logger.error(err)
    exit(1)
  })
