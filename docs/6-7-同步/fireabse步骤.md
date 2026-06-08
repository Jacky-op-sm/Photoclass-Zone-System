1. 创建 Firebase 项目
打开 Firebase Console
点 Add project / 添加项目
项目名可以填：photoclass-zone-system
Google Analytics 可以先关掉
创建完成后进入项目
2. 启用 Firestore
左侧菜单进入 Build → Firestore Database
点 Create database
模式选择 Start in production mode
地区选离你近的即可，比如 asia-east1、asia-southeast1，或默认推荐
创建数据库
3. 配置 Firestore Rules
进入 Firestore 的 Rules 标签
打开本地文件：docs/firestore.rules
把里面内容完整复制到 Firebase Rules 编辑器
点 Publish
4. 创建 Firebase Web App
Firebase 项目首页点齿轮 Project settings
在 General 页面找到 Your apps
点 Web 图标 </>
App nickname 填：photoclass-web
不需要勾选 Firebase Hosting
点 Register app
Firebase 会显示一段 firebaseConfig
5. 填入本地配置
打开本地文件：
assets/js/firebase-config.js
把现在的：
js



window.PHOTOCLASS_FIREBASE_CONFIG = null;

替换成 Firebase 给你的配置，形式大概是：
js



window.PHOTOCLASS_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};