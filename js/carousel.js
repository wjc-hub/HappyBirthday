/*

  回忆相册
  ========
  原生 JS 实现的模态轮播，无外部依赖。
  照片列表读取 CONFIG.photos；src 为空时渲染占位卡片。

*/

var Carousel = (function () {

  var modal,        // 模态遮罩
      track,        // 图片轨道
      dotsWrap,     // 指示点容器
      slides = [],
      dots = [],
      index = 0,
      timer = null,
      isOpen = false,
      touchStartX = null;

  // 占位卡片的渐变配色，按序号轮转
  var placeholderColors = [
    ['#ff9a9e', '#fecfef'],
    ['#a1c4fd', '#c2e9fb'],
    ['#ffecd2', '#fcb69f'],
    ['#d4fc79', '#96e6a1'],
    ['#e0c3fc', '#8ec5fc'],
  ];

  function buildSlide(photo, i) {
    var slide = document.createElement('div');
    slide.className = 'carousel-slide';

    if (photo.src) {
      var img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.caption || '';
      // 图片加载失败时退化为占位卡，避免出现碎图图标
      img.onerror = function () {
        slide.removeChild(img);
        slide.appendChild(buildPlaceholder(photo, i));
      };
      slide.appendChild(img);
    } else {
      slide.appendChild(buildPlaceholder(photo, i));
    }

    if (photo.caption) {
      var cap = document.createElement('div');
      cap.className = 'carousel-caption';
      cap.textContent = CONFIG.fill(photo.caption);
      slide.appendChild(cap);
    }

    return slide;
  }

  function buildPlaceholder(photo, i) {
    var c = placeholderColors[i % placeholderColors.length],
        ph = document.createElement('div');

    ph.className = 'carousel-placeholder';
    ph.style.background = 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')';
    ph.innerHTML =
      '<div class="carousel-placeholder-num">' + (i + 1) + '</div>' +
      '<div class="carousel-placeholder-tip">把照片放进 images/<br>再填写 config.js 的 photos</div>';

    return ph;
  }

  function build() {
    var photos = (CONFIG.photos || []);

    modal = document.createElement('div');
    modal.className = 'carousel-modal';
    modal.innerHTML =
      '<div class="carousel-box">' +
        '<button class="carousel-close" aria-label="关闭">&times;</button>' +
        '<div class="carousel-viewport"><div class="carousel-track"></div></div>' +
        '<button class="carousel-btn carousel-prev" aria-label="上一张">&#10094;</button>' +
        '<button class="carousel-btn carousel-next" aria-label="下一张">&#10095;</button>' +
        '<div class="carousel-dots"></div>' +
      '</div>';

    track = modal.querySelector('.carousel-track');
    dotsWrap = modal.querySelector('.carousel-dots');

    for (var i = 0; i < photos.length; i++) {
      var slide = buildSlide(photos[i], i);
      track.appendChild(slide);
      slides.push(slide);

      var dot = document.createElement('button');
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      dotsWrap.appendChild(dot);
      dots.push(dot);
    }

    document.body.appendChild(modal);
    bind();
    update();
  }

  function update() {
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    for (var i = 0; i < dots.length; i++) {
      if (i === index) {
        dots[i].classList.add('carousel-dot--active');
      } else {
        dots[i].classList.remove('carousel-dot--active');
      }
    }
  }

  function go(n) {
    if (!slides.length) return;
    // 环形翻页
    index = (n + slides.length) % slides.length;
    update();
  }

  function next() { go(index + 1); }
  function prev() { go(index - 1); }

  function startAuto() {
    stopAuto();
    if (CONFIG.photoInterval > 0 && slides.length > 1) {
      timer = setInterval(next, CONFIG.photoInterval);
    }
  }

  function stopAuto() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function bind() {
    modal.querySelector('.carousel-close').addEventListener('click', close);
    modal.querySelector('.carousel-prev').addEventListener('click', function () {
      prev();
      startAuto();   // 手动翻页后重置自动播放计时，避免刚点完就跳走
    });
    modal.querySelector('.carousel-next').addEventListener('click', function () {
      next();
      startAuto();
    });

    dotsWrap.addEventListener('click', function (e) {
      var i = dots.indexOf(e.target);
      if (i !== -1) {
        go(i);
        startAuto();
      }
    });

    // 点击遮罩空白处关闭
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    // 悬停暂停自动播放
    var box = modal.querySelector('.carousel-box');
    box.addEventListener('mouseenter', stopAuto);
    box.addEventListener('mouseleave', function () {
      if (isOpen) startAuto();
    });

    // 移动端滑动翻页
    box.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
      stopAuto();
    }, { passive: true });

    box.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        dx < 0 ? next() : prev();
      }
      touchStartX = null;
      if (isOpen) startAuto();
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') { prev(); startAuto(); }
      else if (e.key === 'ArrowRight') { next(); startAuto(); }
    });
  }

  function open() {
    if (!modal) build();
    if (!slides.length) return;
    isOpen = true;
    modal.classList.add('carousel-modal--visible');
    startAuto();
  }

  function close() {
    isOpen = false;
    stopAuto();
    modal.classList.remove('carousel-modal--visible');
  }

  return {
    open: open,
    close: close,
    toggle: function () { isOpen ? close() : open(); },
    // 没有配置任何照片时，主页面据此隐藏相册按钮
    hasPhotos: function () {
      return !!(CONFIG.photos && CONFIG.photos.length);
    }
  };
}());
