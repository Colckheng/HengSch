# HengSch Todo Web 端部署指南

Web 端为 Vite + React 静态站点，构建产物在 `v1.1.0-web/dist`。支持 Vercel、Netlify、GitHub Pages 等静态托管。

---

## 方式一：Vercel（推荐）

### 通过网页

1. 打开 [vercel.com](https://vercel.com)，登录（支持 GitHub）。
2. 点击 **Add New Project**，导入 HengSch 仓库。
3. **重要**：**Root Directory** 必须保持为**空**或填 **`.`**（仓库根目录）。若误选为 `v1.1.0-web`，会报错 `Missing script: "build:web"`，因为该脚本定义在根目录 `package.json`。
4. 构建配置已写在根目录 `vercel.json`，一般无需修改。
5. 点击 **Deploy** 完成部署。

### 通过命令行

```bash
cd D:\github\HengSch
npm install
npm run build:web
npx vercel
```

首次会提示登录和项目设置；之后可用 `npx vercel --prod` 部署到生产环境。

---

## 方式二：Netlify

### 通过网页

1. 打开 [netlify.com](https://netlify.com)，登录并导入 HengSch 仓库。
2. 构建配置已写在根目录 `netlify.toml`：
   - **Build command**：`npm run build:web`
   - **Publish directory**：`v1.1.0-web/dist`
3. 点击 **Deploy site**。

### 拖拽部署

```bash
cd D:\github\HengSch
npm install
npm run build:web
```

然后将整个 `v1.1.0-web/dist` 文件夹拖到 [Netlify Drop](https://app.netlify.com/drop)。

---

## 方式三：GitHub Pages

若部署到 `https://<username>.github.io/HengSch`，需在 `v1.1.0-web/vite.config.ts` 中设置 `base`：

```ts
export default defineConfig({
  base: '/HengSch/',  // 与仓库名一致
  // ...
});
```

然后：

1. 在仓库 **Settings → Pages** 中开启 GitHub Pages。
2. 选择 GitHub Actions 或指定分支部署。
3. 构建命令：`npm run build:web`
4. 发布目录：`v1.1.0-web/dist`

---

## 本地构建

```bash
cd D:\github\HengSch
npm install
npm run build:web
```

构建完成后，`v1.1.0-web/dist` 即为可部署的静态文件，可上传至任意支持静态网站的托管服务。
