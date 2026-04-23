import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // 应用ID（唯一标识，格式：域名倒写+应用名）
  appId: 'com.travelmemory.app',
  
  // 应用名称（显示在手机桌面的名字）
  appName: '旅行记',
  
  // 网页文件所在目录（. 表示当前目录）
  webDir: '.',
  
  // 服务器配置
  server: {
    androidScheme: 'https'
  },
  
  // Android 专用配置
  android: {
    allowMixedContent: true  // 允许混合内容（http+https）
  }
};

export default config;