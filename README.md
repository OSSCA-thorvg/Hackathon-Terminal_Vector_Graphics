# 🚀 TermVG — Terminal Vector Graphics Player

> **ThorVG 기반 고성능 터미널 벡터 그래픽 플레이어**
>
> CLI 환경에서 Lottie 애니메이션과 SVG를 30fps로 실시간 렌더링합니다.

🌐 **라이브 브라우저 데모**: [GitHub Pages 데모 확인하기](https://ossca-thorvg.github.io/Hackathon-Terminal_Vector_Graphics/)

---

## 📦 설치 및 실행

### 방법 1: npm (권장)

가장 간단하게 전역 패키지로 설치하여 사용할 수 있습니다. (Node.js 18 이상 필요)

```bash
npm install -g termvg
termvg
```

**단일 파일 바로 재생하기:**
```bash
termvg play example.json
```

---

### 방법 2: Docker

Node.js 환경을 설정하고 싶지 않다면 Docker를 통해 즉시 실행할 수 있습니다.

```bash
docker run -it --rm -v $(pwd):/data node:20-slim bash -c "npm install -g termvg && termvg"
```
*(현재 디렉터리가 컨테이너 내 `/data`에 마운트되어 로컬 파일을 열 수 있습니다)*

---

### 방법 3: 로컬 개발 환경 소스 빌드

```bash
git clone https://github.com/OSSCA-thorvg/Hackathon-Terminal_Vector_Graphics.git
cd Hackathon-Terminal_Vector_Graphics/react-wasm
npm install
npm run build
node dist/index.js
```

---

## 📖 상세 매뉴얼

기능, 단축키 사용법, 렌더링 아키텍처 및 MCP 연동 등의 상세 정보는 **[상세 매뉴얼 (DETAILS.md)](./docs/DETAILS.md)** 에서 확인하실 수 있습니다.

- [✨ 핵심 기능](./docs/DETAILS.md#-핵심-기능)
- [🏗 렌더링 아키텍처](./docs/DETAILS.md#-아키텍처)
- [🎮 터미널 단축키 및 조작법](./docs/DETAILS.md#-사용법-단축키-및-ui)
- [🎨 렌더링 모드 비교](./docs/DETAILS.md#-렌더링-모드-비교)
- [🌐 LottieFiles MCP (온라인 에셋 검색)](./docs/DETAILS.md#-lottiefiles-mcp-연동)
- [🔧 트러블슈팅 및 기술 스택](./docs/DETAILS.md#-트러블슈팅-하이라이트)

---

## 📄 라이선스

이 프로젝트는 [ThorVG OSSCA 해커톤](https://github.com/thorvg)의 일환으로 제작되었습니다. (MIT License)

<p align="center">
  <b>TermVG</b> — 터미널의 한계를 넘어, 벡터 그래픽의 가능성을 열다.
</p>
