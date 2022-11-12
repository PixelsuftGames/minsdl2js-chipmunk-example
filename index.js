const minsdl2js = require('minsdl2js');
const cp = require('chipmunk/cp.min');

const binary_prefix = process.platform == 'win32' ? '' : 'lib';
const dll = minsdl2js.load_sdl2_library(binary_prefix + 'SDL2');
const ttf_dll = minsdl2js.load_sdl2_ttf_library(binary_prefix + 'SDL2_ttf');
const img_dll = minsdl2js.load_sdl2_image_library(binary_prefix + 'SDL2_image');
const gfx_dll = minsdl2js.load_sdl2_gfx_library(binary_prefix + 'SDL2_gfx');
const sdl = minsdl2js.sdl2;

class FPS {
  constructor() {
    this.freq = dll.SDL_GetPerformanceFrequency();
    this.delta = 0.0;
    this.last_tick = dll.SDL_GetPerformanceCounter();
  }

  tick() {
    const now = dll.SDL_GetPerformanceCounter();
    this.delta = (now - this.last_tick) / this.freq;
    this.last_tick = now;
    return this.delta;
  }

  get_fps() {
    return Math.floor(1 / this.delta);
  }
}

class Circle {
  constructor(app, x, y) {
    this.renderer = app.renderer;
    this.space = app.space;
    this.circles = app.circles;
    this.mass = app.random_float(0.2, 1.75);
    this.radius = app.random_int(5, 100);
    this.color = [app.random_int(0, 255), app.random_int(0, 255), app.random_int(0, 255)];
    this.moment = cp.momentForCircle(this.mass, 0, this.radius, cp.vzero);
    this.body = new cp.Body(this.mass, this.moment);
    this.body.setPos(cp.v(x, y));
    this.shape = new cp.CircleShape(this.body, this.radius, cp.vzero);
    this.shape.setElasticity(app.random_float(0, 1.2));
    this.shape.setFriction(app.random_float(0, 2));
    this.space.addBody(this.body);
    this.space.addShape(this.shape);
    this.circles.push(this);
  }

  draw() {
    if (this.body.p.y > 1000) {
      this.circles.splice(this.circles.indexOf(this), 1);
      this.space.removeBody(this.body);
      this.space.removeShape(this.shape);
      return 0;
    }
    if (this.body.p.y < -1000 || this.body.p.x < -1000 || this.body.p.x > 1252)
      return 1;
    gfx_dll.filledCircleRGBA(
      this.renderer,
      this.body.p.x,
      this.body.p.y,
      this.radius, this.color[0], this.color[1], this.color[2], 255
    );
    return 1;
  }
}

class App {
  constructor() {
    dll.SDL_Init(sdl.SDL_INIT_VIDEO | sdl.SDL_INIT_EVENTS);
    ttf_dll.TTF_Init();
    img_dll.IMG_Init(sdl.IMG_INIT_PNG);
    this.renderer_string = 'none';
    this.allow_async_flip = true;
    this.renderer_id = this.get_renderer_id();
    this.window = dll.SDL_CreateWindow(
      'SDL2 Example (' + this.renderer_string + ')',
      sdl.SDL_WINDOWPOS_CENTERED, sdl.SDL_WINDOWPOS_CENTERED,
      1152, 864,
      sdl.SDL_WINDOW_ALLOW_HIGHDPI
    );
    this.renderer = dll.SDL_CreateRenderer(
      this.window,
      this.renderer_id,
      sdl.SDL_RENDERER_ACCELERATED | (process.argv.includes('--no-vsync') ? 0 : sdl.SDL_RENDERER_PRESENTVSYNC)
    );
    this.font = ttf_dll.TTF_OpenFont('segoeuib.ttf', 48);
    this.background = img_dll.IMG_LoadTexture(this.renderer, 'background.png');
    this.show_background = !process.argv.includes('--no-background');
    this.poll_bind = this.poll_event.bind(this);
    this.loop_bind = this.loop.bind(this);
    this.event_bind = this.event.bind(this);
    this.space = new cp.Space;
    this.space.gravity = cp.v(0, 1750);
    this.floor = new cp.SegmentShape(this.space.staticBody, {
      x: 100,
      y: 800
    }, {
      x: 1052,
      y: 800
    }, 20);
    this.floor_rect = new sdl.SDL_Rect({
      x: this.floor.a.x,
      y: this.floor.a.y - this.floor.r,
      w: this.floor.b.x - this.floor.a.x,
      h: this.floor.r
    }).ref();
    this.floor.setElasticity(0.8);
    this.space.addShape(this.floor);
    this.circles = [];
    this.event = new sdl.SDL_Event;
    this.clock = new FPS;
    setImmediate(this.poll_bind);
  }

  event(event) {
    switch (this.event.type) {
      case sdl.SDL_MOUSEBUTTONDOWN:
        new Circle(this, this.event.button.x, this.event.button.y);
        break;
      case sdl.SDL_QUIT:
        this.destroy();
        return;
    }
    setImmediate(this.poll_bind);
  }

  poll_event() {
    setImmediate(dll.SDL_PollEvent(this.event.ref()) ? this.event_bind : this.loop_bind);
  }

  loop() {
    const dt = this.clock.tick();
    this.space.step(dt);
    if (this.show_background) {
      dll.SDL_RenderCopy(this.renderer, this.background, null, null);
    } else {
      dll.SDL_SetRenderDrawColor(this.renderer, 0, 0, 0, 255);
      dll.SDL_RenderClear(this.renderer);
    }
    for (var i = 0; i < this.circles.length;) {
      i += this.circles[i].draw();
    }
    this.draw_floor();
    this.render_fps();
    if (this.allow_async_flip) {
      dll.SDL_RenderPresent.async(this.renderer, this.poll_bind);
    } else {
      dll.SDL_RenderPresent(this.renderer);
      setImmediate(this.poll_bind);
    }
  }

  draw_floor() {
    dll.SDL_SetRenderDrawColor(this.renderer, 255, 0, 0, 255);
    dll.SDL_RenderFillRect(this.renderer, this.floor_rect);
  }

  render_fps() {
    const text_surface = ttf_dll.TTF_RenderText_Blended(
      this.font,
      'FPS: ' + this.clock.get_fps(),
      new sdl.SDL_Color({
        r: 0,
        g: 255,
        b: 255
      })
    );
    const text_texture = dll.SDL_CreateTextureFromSurface(this.renderer, text_surface);
    dll.SDL_RenderCopy(
      this.renderer,
      text_texture,
      null,
      new sdl.SDL_Rect({
        x: 0,
        y: 0,
        w: text_surface.deref().w,
        h: text_surface.deref().h
      }).ref()
    );
    dll.SDL_DestroyTexture(text_texture);
    dll.SDL_FreeSurface(text_surface);
  }

  get_renderer_id() {
    var renderers = [];
    var prefer_order = ['direct3d12', 'direct3d11', 'direct3d', 'opengl', 'opengles2', 'opengles', 'software'];
    if (process.argv.includes('--renderer')) {
      prefer_order.splice(0, 0, process.argv[process.argv.indexOf('--renderer') + 1]);
    }
    for (var i = 0; i < dll.SDL_GetNumRenderDrivers(); i++) {
      const renderer_info = new sdl.SDL_RendererInfo;
      dll.SDL_GetRenderDriverInfo(i, renderer_info.ref());
      renderers.push(renderer_info.name);
    }
    for (var i = 0; i < prefer_order.length; i++) {
      if (renderers.includes(prefer_order[i])) {
        this.renderer_string = prefer_order[i];
        if (this.renderer_string.startsWith('opengl'))
          this.allow_async_flip = false;
        return renderers.indexOf(this.renderer_string);
      }
    }
    return -1;
  }

  random_float(min, max) {
    return Math.random() * (max - min) + min;
  }

  random_int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  destroy() {
    this.space.removeShape(this.floor);
    dll.SDL_DestroyTexture(this.background);
    dll.SDL_DestroyRenderer(this.renderer);
    dll.SDL_DestroyWindow(this.window);
    img_dll.IMG_Quit();
    ttf_dll.TTF_CloseFont(this.font);
    ttf_dll.TTF_Quit();
    dll.SDL_Quit();
  }
}

const app = new App;
