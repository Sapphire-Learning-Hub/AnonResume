const mujicvIconAliases: Record<string, string> = {
  info: "lucide:info",
  phone: "lucide:phone",
  email: "lucide:mail",
  mail: "lucide:mail",
  location: "lucide:map-pin",
  weixin: "simple-icons:wechat",
  wechat: "simple-icons:wechat",
  juejin: "simple-icons:juejin",
  github: "simple-icons:github",
  gitee: "simple-icons:gitee",
  zhihu: "simple-icons:zhihu",
  yuque: "simple-icons:yuque",
};

export function resolveMujicvIconId(name: string) {
  return mujicvIconAliases[name.trim().toLocaleLowerCase()];
}
