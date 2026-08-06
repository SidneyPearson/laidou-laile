# 原始大图放这里

把要替换的首页大图放进 `homepage/`，文件名用以下任一名字（支持 png/jpg/jpeg/webp）：

| 想替换 | 可识别的文件名 |
|---|---|
| 首页封面 hero | `hero` / `封面` / `01...` |
| 情侣约会 | `couple` / `情侣` / `约会` / `02...` |
| 亲子玩乐 | `family` / `亲子` / `03...` |
| 特种兵式 | `fast` / `soldier` / `特种兵` / `04...` |
| 懒人躺平 | `lazy` / `懒人` / `05...` |

然后运行：

```bash
npm run img:compress
```

会自动转成 JPG(质量72)、按目标尺寸缩小，替换 `client/src/assets/homepage/` 里的正式图。
