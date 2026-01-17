# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-01-17

### 🎉 重大更新：电竞数据浏览功能

#### ✨ 新增功能

- **电竞数据浏览页面 (`/data`)**
  - 全新的四列层级展示：赛区 → 联赛 → 战队 → 选手
  - 支持 7 大赛区：LPL, LEC, LCK, LCS, LTA North/South/Cross-Conference
  - 交互式数据浏览，点击即可查看下级数据
  - 面包屑导航，清晰显示当前浏览路径
  - 中英文双语支持

- **层级数据 API (`/api/lol/hierarchy`)**
  - `type=summary` - 获取数据摘要和赛区列表
  - `type=regions` - 获取所有赛区
  - `type=region` - 获取指定赛区的联赛
  - `type=tournament` - 获取指定联赛的战队
  - `type=team` - 获取指定战队的选手
  - `type=all-teams` - 获取所有有选手的战队

- **数据获取脚本**
  - `fetch_lol_data.py` - 从 GRID API 获取 LOL 数据
    - 支持速率限制处理和自动重试
    - 分页获取所有选手、战队、联赛数据
    - 自动保存中间结果，防止数据丢失
  - `build_hierarchy.py` - 构建层级数据结构
    - 从联赛名称自动提取赛区信息
    - 建立选手→战队→联赛→赛区的完整关系链
    - 生成数据摘要和统计信息

#### 📊 数据统计

- **18,765** 名 LOL 选手
- **2,160** 支战队
- **173** 个联赛
- **7** 个主要赛区
- 数据覆盖：2024 年 1 月至今

#### 🔧 技术改进

- 优化内存使用，支持大数据量处理
- 实现数据缓存机制，提升加载速度
- 添加错误处理和重试逻辑
- 改进 API 响应结构，减少数据传输量

#### 📝 文档

- 新增完整的 README.md
- 详细的 API 文档
- 数据脚本使用说明

#### 🎨 UI/UX 改进

- 响应式四列布局，适配各种屏幕尺寸
- 流畅的加载动画和过渡效果
- 清晰的视觉层级，使用不同颜色区分各级数据
- 优化的滚动体验

---

## [1.0.0] - 2025-01-15

### 初始版本

#### ✨ 功能

- BP（Ban/Pick）辅助工具
- 实时战队阵容数据
- AI 智能推荐
- 支持主流赛区

#### 🛠 技术栈

- Next.js 16
- TypeScript
- Tailwind CSS
- Framer Motion
- GRID Esports API

---

## 数据来源说明

### GRID Esports API 数据覆盖

根据查询确认，GRID Open Access API 的 LOL 数据覆盖范围：

| 年份 | 比赛场数 | 说明 |
|------|----------|------|
| 2020-2023 | 0 | 无数据 |
| 2024 | 776 | 完整数据 |
| 2025 | 856 | 完整数据 |

**最早数据**：2024-01-13 (LEC Winter 2024)

如需更早的历史数据，可能需要：
- GRID Full Access 权限
- 其他数据源（Leaguepedia, Oracle's Elixir 等）

---

## 版本说明

- **主版本号**：重大功能更新或架构变更
- **次版本号**：新功能添加
- **修订号**：Bug 修复和小改进

## 贡献

欢迎提交 Issue 和 Pull Request！
