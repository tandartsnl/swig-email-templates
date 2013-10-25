var realswig           = require("swig")
  , juice              = require("juice")
  , path               = require("path")
  , jsdom              = require("jsdom")
  , createDummyContext = require('swig-dummy-context')

module.exports          = init;
init.createDummyContext = createDummyContext;

function init(options, cb) {
  var swig;

  if (options) {
    if (options.swig)
      swig = options.swig
    else if (options.compileFile)
      swig = options

    if (swig)
      options = null;
  }

  options = extend({
    root       : path.join(__dirname, "templates"),
    allowErrors: true,
  }, options || {});

  if (!swig)
    (swig = realswig).init(options);

  cb(null, render, dummyContext);

  function dummyContext(templateName, cb) {
    // compile file into swig template
    compileTemplate(swig, templateName, function(err, template) {
      if (err) return cb(err);
      // return the tokens
      cb(null, createDummyContext(template));
    });
  }

  function render(templateName, context, css, urlRewriteFn, cb) {
    switch (arguments.length) {
      case 3:
        cb           = css;
        css          = null;
        urlRewriteFn = null;
        break;

      case 4:
        cb           = urlRewriteFn;

        if (typeof css === 'function') {
          urlRewriteFn = css;
          css          = null;
        } else {
          urlRewriteFn = null;
        }

        break;
    }

    // compile file into swig template
    compileTemplate(swig, templateName, function(err, template) {
      if (err) return cb(err);
      // render template with context
      renderTemplate(template, context, function(err, html) {
        if (err) return cb(err);
        createJsDomInstance(html, function(err, document) {
          var done = function(err) {
            if (err) {
              // free the associated memory
              // with lazily created parentWindow
              tryCleanup();
              cb(err);
            } else {
              var inner = document.innerHTML;
              tryCleanup();
              cb(null, inner);
            }

            function tryCleanup() {
              try { document.parentWindow.close(); } catch (e) {}
              try { document.close();              } catch (e) {}
            }
          };

          if (err) return cb(err);
          if (urlRewriteFn) rewriteUrls(document, urlRewriteFn);

          if (css) {
            juice.inlineDocument(document, css);
            done();
          } else {
            juice.juiceDocument(document, { url: "file://" + path.resolve(process.cwd(), path.join(options.root, templateName)) }, done);
          }
        });
      });
    });
  }
}

function rewriteUrls(document, rewrite, cb) {
  var i, l, j, k, anchorList, attrs, attr;

  anchorList = document.getElementsByTagName("a");

  for (i = 0, l = anchorList.length; i < l; i += 1) {
    attrs = anchorList[i].attributes;

    for (j = 0, k = attrs.length; j < k; j += 1) {
      attr = attrs[j];

      if (attr.name.toLowerCase() === 'href') {
        anchorList[i].setAttribute(attr.name, rewrite(attr.value));
        break;
      }
    }
  }
}

function createJsDomInstance(content, cb) {
  // hack to force jsdom to see this argument as html content, not a url
  // or a filename. https://github.com/tmpvar/jsdom/issues/554
  var html    = content + "\n";
  var options = {
    features  : {
      QuerySelector           : ['1.0'],
      FetchExternalResources  : false,
      ProcessExternalResources: false,
      MutationEvents          : false,
    },
  };

  try { cb(null, jsdom.html(html, null, options)); } catch (e) { cb(e); }
}

function compileTemplate(swig, name, cb)        { try { cb(null, swig.compileFile(name));   } catch (e) { cb(e); } }
function renderTemplate (template, context, cb) { try { cb(null, template.render(context)); } catch (e) { cb(e); } }

function extend(obj, src) {
  for (var key in src)
    if (src.hasOwnProperty(key)) obj[key] = src[key];

  return obj;
}