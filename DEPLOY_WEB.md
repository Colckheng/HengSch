# HengSch Todo Web 部署指南

Web 端基于 Vite + React，当前 2.0.0 发布产物目录为 `v2.0.0-web/dist`。

## Vercel

### 网页操作

1. 导入仓库 `HengSch`。
2. Root Directory 保持为空或填写 `.`。
3. 不要把 Root Directory 选成 `v2.0.0-web`，否则会找不到根目录里的 `build:web` 脚本。
4. 构建配置使用仓库根目录的 [vercel.json](/D:/github/HengSch/vercel.json)。

### 命令行

```bash
cd D:\github\HengSch
npm install
npm run build:web
npx vercel
```

生产发布可使用：

```bash
npx vercel --prod
```

## Netlify

### 控制台配置

- Build command: `npm run build:web`
- Publish directory: `v2.0.0-web/dist`

### 本地构建后拖拽发布

```bash
cd D:\github\HengSch
npm install
npm run build:web
```

然后把 `v2.0.0-web/dist` 拖到 Netlify Drop。

## GitHub Pages

如果部署到 `https://<username>.github.io/HengSch`，需要先在 [v2.0.0-web/vite.config.ts](/D:/github/HengSch/v2.0.0-web/vite.config.ts) 中配置 `base: '/HengSch/'`，再将发布目录设置为 `v2.0.0-web/dist`。

## 本地构建

```bash
cd D:\github\HengSch
npm install
npm run build:web
```

构建完成后，`v2.0.0-web/dist` 就是可部署的静态文件目录。
