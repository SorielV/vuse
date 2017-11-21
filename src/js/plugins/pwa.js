import JSZip from 'jszip';
import saveAs from 'save-as';
import { getImageBlob, cleanDOM } from '../util';

/**
 * Adds a service worker that caches the static assets.
 */
function createSW (output, { images = [] } = {}) {
  const scripts = output.folder('assets/js');

  output.file('sw.js', `
    const staticCacheName = 'bbuilder-static-v1';
    const contentImgsCache = 'bbuilder-content-imgs';

    self.addEventListener('install', function(event) {
      event.waitUntil(
        caches.open(staticCacheName).then(function(cache) {
          return cache.addAll([
            '/',
            '/assets/js/main.js',
            ${images.map(i => "'/assets/img/" + i.name + "'").join(',').trim(',')}
          ]);
        })
      );
    });

    function serveAsset(request) {
      return caches.open(contentImgsCache).then(function(cache) {
        return cache.match(request).then(function(response) {
          if (response) return response;
    
          return fetch(request).then(function(networkResponse) {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      });
    }

    self.addEventListener('fetch', function(event) {
      const requestUrl = new URL(event.request.url);
    
      if (requestUrl.origin === location.origin) {
        if (requestUrl.pathname === '/') {
          event.respondWith(caches.match('/'));
          return;
        }
        if (requestUrl.pathname.startsWith('/assets/')) {
          event.respondWith(serveAsset(event.request));
          return;
        }
      }
    
      event.respondWith(
        caches.match(event.request).then(function(response) {
          return response || fetch(event.request);
        })
      );
    });
  `);

  scripts.file('main.js', `
    function registerSW () {
      if (!navigator.serviceWorker) return;
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        console.log('SW registered!');
      });
    }

    registerSW();
  `);
}

/**
 * Adds some PWA features.
 */
function createPWA (output, payload) {
  createSW(output, payload);
}

function download () {
  const frag = this.outputFragment();
  const images = Array.from(frag.querySelectorAll('img'));
  const artboard = frag.querySelector('#artboard');
  const head = frag.querySelector('head');
  const zip = new JSZip();
  const output = zip.folder('project');
  const imgFolder = output.folder('assets/img');

  Promise.all(images.map((image) => {
    const imageLoader = getImageBlob(image.src);
    return imageLoader.then((img) => {
      imgFolder.file(img.name, img.blob, { base64: true });
      image.setAttribute('src', `assets/img/${img.name}`);

      return img;
    });
  })).then(images => {
    createPWA(output, { images });
  }).then(() => {
    cleanDOM(frag);
    output.file('index.html',
      `<html>
          <head>
            ${head.innerHTML}
          </head>
          <body>
            ${artboard.innerHTML}
          <script src="/assets/js/main.js"></script>
          </body>
        </html>`);

    zip.generateAsync({ type: 'blob' }).then((blob) => {
      saveAs(blob, 'project.zip');
    });
  });
}

export default function install ({ builder }) {
  builder.download = download;
};
