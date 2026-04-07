# HengSch Todo

HengSch Todo 是一个多端待办事项应用，当前 2.0.0 发布线包含桌面端、Web 端和移动端三套工程。

## 项目结构

```text
HengSch/
|-- packages/        # 共享类型、逻辑、存储抽象
|-- v2.0.0/          # 桌面端（Electron + React）
|-- v2.0.0-web/      # Web 端（Vite + React）
`-- v2.0.0-an/       # 移动端（Expo + React Native）
```

## 开发启动

Web 端：

```bash
cd D:\github\HengSch\v2.0.0-web
npm run dev
```

桌面端：

```bash
cd D:\github\HengSch
npm run electron:dev --workspace=v2.0.0
```

移动端：

```bash
cd D:\github\HengSch\v2.0.0-an
npm install
npm run start
```

## 构建与发布

Web 端：

```bash
cd D:\github\HengSch
npm install
npm run build:web
```

产物目录：`v2.0.0-web/dist`

桌面端：

```bash
cd D:\github\HengSch
npm run electron:build --workspace=v2.0.0
```

产物目录：`v2.0.0/release`

移动端 Android：

```bash
cd D:\github\HengSch\v2.0.0-an
eas build --platform android --profile production
```

## 版本说明

- 根目录版本：`2.0.0`
- 桌面端版本：`2.0.0`
- Web 端版本：`2.0.0`
- 移动端 Expo 版本：`2.0.0`
- iOS buildNumber：`2`
- Android versionCode：`2`
