#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <thorvg.h>
#include <vector>
#include <string>
#include <cmath>

using namespace emscripten;

class TermVGEngine {
private:
    tvg::SwCanvas* canvas = nullptr;
    tvg::Animation* animation = nullptr;
    tvg::Shape* bg = nullptr;
    std::vector<uint32_t> buffer;
    uint32_t width = 0;
    uint32_t height = 0;
    bool initialized = false;

    struct RGB {
        int r, g, b;
        bool isBg;
    };

    RGB getRGB(uint32_t argb, bool invertDark) {
        int r = (argb >> 16) & 0xff;
        int g = (argb >> 8) & 0xff;
        int b = argb & 0xff;

        if (r == 1 && g == 1 && b == 1) {
            return {0, 0, 0, true};
        }

        if (invertDark && r < 40 && g < 40 && b < 40) {
            return {200, 200, 200, false};
        }

        return {r, g, b, false};
    }

    float getLuma(int r, int g, int b) {
        return 0.299f * r + 0.587f * g + 0.114f * b;
    }

    int colorDist(int r1, int g1, int b1, int r2, int g2, int b2) {
        return std::abs(r1 - r2) + std::abs(g1 - g2) + std::abs(b1 - b2);
    }

    std::string utf8_encode(int codepoint) {
        std::string result;
        if (codepoint <= 0x7f) {
            result += (char)codepoint;
        } else if (codepoint <= 0x7ff) {
            result += (char)(0xc0 | ((codepoint >> 6) & 0x1f));
            result += (char)(0x80 | (codepoint & 0x3f));
        } else if (codepoint <= 0xffff) {
            result += (char)(0xe0 | ((codepoint >> 12) & 0x0f));
            result += (char)(0x80 | ((codepoint >> 6) & 0x3f));
            result += (char)(0x80 | (codepoint & 0x3f));
        }
        return result;
    }

    std::string bufferToAnsi(bool invertDark) {
        std::string output;
        output.reserve(width * height * 10);
        char buf[128];
        
        for (uint32_t y = 0; y < height / 2; y++) {
            for (uint32_t x = 0; x < width; x++) {
                uint32_t topPixel = buffer[(y * 2) * width + x];
                uint32_t bottomPixel = buffer[(y * 2 + 1) * width + x];

                RGB top = getRGB(topPixel, invertDark);
                RGB bottom = getRGB(bottomPixel, invertDark);

                snprintf(buf, sizeof(buf), "\x1b[48;2;%d;%d;%dm\x1b[38;2;%d;%d;%dm▄", 
                         top.r, top.g, top.b, bottom.r, bottom.g, bottom.b);
                output += buf;
            }
            output += "\x1b[0m\n";
        }
        if (!output.empty()) output.pop_back();
        return output;
    }

    std::string bufferToQuadrant(bool invertDark) {
        const char* quadrantMap[] = {
            " ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", 
            "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"
        };
        std::string output;
        output.reserve(width * height * 10);
        char buf[128];

        uint32_t termW = width / 2;
        uint32_t termH = height / 2;

        for (uint32_t ty = 0; ty < termH; ty++) {
            for (uint32_t tx = 0; tx < termW; tx++) {
                RGB p[4] = {
                    getRGB(buffer[(ty * 2) * width + (tx * 2)], invertDark),
                    getRGB(buffer[(ty * 2) * width + (tx * 2 + 1)], invertDark),
                    getRGB(buffer[(ty * 2 + 1) * width + (tx * 2)], invertDark),
                    getRGB(buffer[(ty * 2 + 1) * width + (tx * 2 + 1)], invertDark)
                };

                float minLuma = 999.0f, maxLuma = -1.0f;
                int bgIdx = 0, fgIdx = 0;
                
                for (int i = 0; i < 4; i++) {
                    float luma = getLuma(p[i].r, p[i].g, p[i].b);
                    if (luma < minLuma) { minLuma = luma; bgIdx = i; }
                    if (luma > maxLuma) { maxLuma = luma; fgIdx = i; }
                }

                RGB bg = p[bgIdx];
                RGB fg = p[fgIdx];

                if (colorDist(bg.r, bg.g, bg.b, fg.r, fg.g, fg.b) < 15) {
                    snprintf(buf, sizeof(buf), "\x1b[48;2;%d;%d;%dm ", bg.r, bg.g, bg.b);
                    output += buf;
                    continue;
                }

                int pattern = 0;
                int fgCount = 0, bgCount = 0;
                int fgR = 0, fgG = 0, fgB = 0;
                int bgR = 0, bgG = 0, bgB = 0;

                for (int i = 0; i < 4; i++) {
                    int distToBg = colorDist(p[i].r, p[i].g, p[i].b, bg.r, bg.g, bg.b);
                    int distToFg = colorDist(p[i].r, p[i].g, p[i].b, fg.r, fg.g, fg.b);
                    
                    if (distToFg <= distToBg) {
                        pattern |= (1 << i);
                        fgR += p[i].r; fgG += p[i].g; fgB += p[i].b;
                        fgCount++;
                    } else {
                        bgR += p[i].r; bgG += p[i].g; bgB += p[i].b;
                        bgCount++;
                    }
                }

                RGB finalBg = bgCount > 0 ? RGB{bgR/bgCount, bgG/bgCount, bgB/bgCount, false} : bg;
                RGB finalFg = fgCount > 0 ? RGB{fgR/fgCount, fgG/fgCount, fgB/fgCount, false} : fg;

                const char* charStr = quadrantMap[pattern];
                snprintf(buf, sizeof(buf), "\x1b[48;2;%d;%d;%dm\x1b[38;2;%d;%d;%dm%s", 
                         finalBg.r, finalBg.g, finalBg.b, finalFg.r, finalFg.g, finalFg.b, charStr);
                output += buf;
            }
            output += "\x1b[0m\n";
        }
        if (!output.empty()) output.pop_back();
        return output;
    }

    std::string bufferToBraille(bool invertDark) {
        std::string output;
        output.reserve(width * height * 5);
        char buf[128];

        const int brailleMap[4][2] = {
            {0x01, 0x08},
            {0x02, 0x10},
            {0x04, 0x20},
            {0x40, 0x80}
        };

        uint32_t termW = width / 2;
        uint32_t termH = height / 4;

        for (uint32_t ty = 0; ty < termH; ty++) {
            for (uint32_t tx = 0; tx < termW; tx++) {
                int brailleChar = 0x2800;
                int rSum = 0, gSum = 0, bSum = 0;
                int activePixels = 0;

                for (uint32_t y = 0; y < 4; y++) {
                    for (uint32_t x = 0; x < 2; x++) {
                        uint32_t px = tx * 2 + x;
                        uint32_t py = ty * 4 + y;
                        if (px < width && py < height) {
                            uint32_t pixel = buffer[py * width + px];
                            RGB rgb = getRGB(pixel, invertDark);
                            int a = (pixel >> 24) & 0xff;
                            
                            if (!rgb.isBg && a > 128 && (rgb.r + rgb.g + rgb.b) > 30) {
                                brailleChar |= brailleMap[y][x];
                                rSum += rgb.r;
                                gSum += rgb.g;
                                bSum += rgb.b;
                                activePixels++;
                            }
                        }
                    }
                }

                if (activePixels > 0) {
                    int avgR = rSum / activePixels;
                    int avgG = gSum / activePixels;
                    int avgB = bSum / activePixels;
                    snprintf(buf, sizeof(buf), "\x1b[38;2;%d;%d;%dm%s", 
                             avgR, avgG, avgB, utf8_encode(brailleChar).c_str());
                    output += buf;
                } else {
                    output += " ";
                }
            }
            output += "\x1b[0m\n";
        }
        if (!output.empty()) output.pop_back();
        return output;
    }

public:
    TermVGEngine() {
        if (tvg::Initializer::init(0) == tvg::Result::Success) {
            initialized = true;
        }
    }

    ~TermVGEngine() {
        delete animation;
        delete canvas; // SwCanvas destructor is accessible
        if (initialized) {
            tvg::Initializer::term();
        }
    }

    bool init() {
        return initialized;
    }

    void setSize(uint32_t w, uint32_t h) {
        width = w;
        height = h;
        buffer.resize(width * height, 0);
        std::fill(buffer.begin(), buffer.end(), 0);
        
        if (!canvas) {
            canvas = tvg::SwCanvas::gen();
        }
        canvas->target(buffer.data(), width, width, height, tvg::ColorSpace::ARGB8888);
    }

    int load(std::string data) {
        if (!canvas) return -1;
        
        std::fill(buffer.begin(), buffer.end(), 0);

        // Clean up previous animation/bg if any
        canvas->remove();
        if (animation) {
            delete animation;
            animation = nullptr;
        }

        animation = tvg::Animation::gen();
        auto picture = animation->picture();
        
        auto res = picture->load(data.c_str(), data.size(), "", nullptr, true);
        if (res != tvg::Result::Success) {
            return (int)res;
        }
        
        // Setup background
        bg = tvg::Shape::gen();
        bg->appendRect(0, 0, width, height);
        bg->fill(1, 1, 1, 255); // Magic chroma-key background
        canvas->add(bg);

        // Scale picture to fit window
        float pw, ph;
        picture->size(&pw, &ph);
        float scale = (width / pw < height / ph) ? (width / pw) : (height / ph);
        picture->scale(scale);
        picture->translate((width - pw * scale) * 0.5f, (height - ph * scale) * 0.5f);
        
        canvas->add(picture);

        return 0;
    }

    float getDuration() {
        if (animation) {
            return animation->duration();
        }
        return 0.0f;
    }

    uint32_t getTotalFrames() {
        if (animation) {
            return animation->totalFrame();
        }
        return 0;
    }

    std::string renderToString(uint32_t frame, int renderMode, bool invertDark) {
        if (!canvas || !animation || buffer.empty()) {
            return "";
        }

        animation->frame(frame);
        
        canvas->update();
        canvas->draw();
        canvas->sync();

        if (renderMode == 0) return bufferToAnsi(invertDark);
        if (renderMode == 1) return bufferToQuadrant(invertDark);
        if (renderMode == 2) return bufferToBraille(invertDark);
        return "";
    }
};

EMSCRIPTEN_BINDINGS(TermVGWasm) {
    class_<TermVGEngine>("TermVGEngine")
        .constructor<>()
        .function("init", &TermVGEngine::init)
        .function("setSize", &TermVGEngine::setSize)
        .function("load", &TermVGEngine::load)
        .function("getDuration", &TermVGEngine::getDuration)
        .function("getTotalFrames", &TermVGEngine::getTotalFrames)
        .function("renderToString", &TermVGEngine::renderToString);
}
