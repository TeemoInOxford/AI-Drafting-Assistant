# Pick 推荐理由生成 - 实际调用示例

## 场景描述
第二轮 Pick 阶段，我方是红色方，需要为中单选手 Chovy 选择阿兹尔。

## 输入数据（JSON 格式）

```json
{
  "bpState": {
    "step": 4,
    "phase": "pick2",
    "side": "红色方",
    "ourBans": ["剑姬", "卡莉丝塔", "维鲁斯"],
    "enemyBans": ["阿卡丽", "妖姬", "佐伊"],
    "ourPicks": ["奥恩"],
    "enemyPicks": ["盲僧", "锤石"],
    "remainingPositions": ["中单", "打野", "ADC", "辅助"]
  },
  "pickTarget": {
    "championName": "阿兹尔",
    "positionName": "中单",
    "playerName": "Chovy"
  },
  "analysisSignals": {
    "playerRelated": {
      "proficiencyScore": 95,
      "usageRate": 42,
      "isSignature": true,
      "recentWinRate": 78,
      "recencyScore": 85
    },
    "heroStrength": {
      "heroStrength": 86,
      "metaTier": "T0",
      "presenceRate": 82,
      "priorityScore": 88
    },
    "systemTactical": {
      "systemFitScore": 82,
      "systemName": "中期团战体系",
      "synergyScore": 80,
      "synergyChampions": ["奥恩"]
    },
    "compositionRelation": {
      "countersEnemyPicks": true,
      "counterTargets": ["盲僧"],
      "counteredByEnemy": false,
      "counteredScore": 20,
      "fillsGap": true,
      "gapType": "持续输出"
    },
    "phaseFactors": {
      "pickRound": 2,
      "enemyMightContest": true,
      "contestScore": 85,
      "delayRisk": 80
    }
  }
}
```

## AI Prompt 构建

### System Prompt
```
[pick-reason-prompt.md 的完整内容]
```

### User Input
```
请根据以下信息生成 Pick 推荐理由：

## 当前 BP 状态
- 当前步骤：4
- Pick 阶段轮次：pick2
- 我方阵营：红色方
- 我方已 Ban：剑姬、卡莉丝塔、维鲁斯
- 敌方已 Ban：阿卡丽、妖姬、佐伊
- 我方已选：奥恩
- 敌方已选：盲僧、锤石
- 我方待选位置：中单、打野、ADC、辅助

## Pick 目标
- 英雄名称：阿兹尔
- 目标位置：中单
- 目标选手：Chovy

## 结构化分析信号

### 我方选手相关
- 选手熟练度：95/100
- 使用率：42%
- 是否招牌英雄：是
- 近期胜率：78%
- 近期使用频率：85/100

### 英雄强度与环境
- 英雄强度：86/100
- 版本等级：T0
- 职业比赛出场率：82%
- 优先级评分：88/100

### 体系与战术
- 体系适配度：82/100
- 体系名称：中期团战体系
- 与已选英雄的协同度：80/100
- 协同英雄：奥恩

### 阵容关系
- 是否克制敌方已选英雄：是
- 克制目标：盲僧
- 是否被敌方已选英雄克制：否
- 被克制程度：20/100
- 是否填补我方阵容缺口：是
- 缺口类型：持续输出

### 阶段因素
- 当前是第几轮 Pick：第2轮
- 如果不在本轮选择，敌方是否可能抢夺：是
- 被抢风险程度：85/100
- 延后选择的风险程度：80/100
```

## AI 预期输出

```
Chovy的招牌阿兹尔（熟练度95分，近期胜率78%）
版本T0级强势英雄（强度86分），本轮不选敌方可能抢夺（被抢风险85分）
完成中期团战体系核心，与已选奥恩形成强势配合（协同度80分）
克制敌方已选的盲僧，限制其节奏型打法
填补我方持续输出缺口，完善团队功能结构
```

## 代码实现示例（TypeScript）

```typescript
interface PickReasonRequest {
  bpState: {
    step: number;
    phase: string;
    side: string;
    ourBans: string[];
    enemyBans: string[];
    ourPicks: string[];
    enemyPicks: string[];
    remainingPositions: string[];
  };
  pickTarget: {
    championName: string;
    positionName: string;
    playerName?: string;
  };
  analysisSignals: {
    playerRelated: {
      proficiencyScore: number;
      usageRate: number;
      isSignature: boolean;
      recentWinRate: number;
      recencyScore: number;
    };
    heroStrength: {
      heroStrength: number;
      metaTier: string;
      presenceRate: number;
      priorityScore: number;
    };
    systemTactical: {
      systemFitScore: number;
      systemName?: string;
      synergyScore: number;
      synergyChampions: string[];
    };
    compositionRelation: {
      countersEnemyPicks: boolean;
      counterTargets: string[];
      counteredByEnemy: boolean;
      counteredScore: number;
      fillsGap: boolean;
      gapType?: string;
    };
    phaseFactors: {
      pickRound: number;
      enemyMightContest: boolean;
      contestScore: number;
      delayRisk: number;
    };
  };
}

async function generatePickReasons(request: PickReasonRequest): Promise<string[]> {
  // 1. 读取 pick-reason-prompt.md 作为系统提示词
  const systemPrompt = await fs.readFile('prompts/pick-reason-prompt.md', 'utf-8');

  // 2. 构建用户输入
  const userInput = `
请根据以下信息生成 Pick 推荐理由：

## 当前 BP 状态
- 当前步骤：${request.bpState.step}
- Pick 阶段轮次：${request.bpState.phase}
- 我方阵营：${request.bpState.side}
- 我方已 Ban：${request.bpState.ourBans.join('、') || '无'}
- 敌方已 Ban：${request.bpState.enemyBans.join('、') || '无'}
- 我方已选：${request.bpState.ourPicks.join('、') || '无'}
- 敌方已选：${request.bpState.enemyPicks.join('、') || '无'}
- 我方待选位置：${request.bpState.remainingPositions.join('、')}

## Pick 目标
- 英雄名称：${request.pickTarget.championName}
- 目标位置：${request.pickTarget.positionName}
- 目标选手：${request.pickTarget.playerName || '未指定'}

## 结构化分析信号

### 我方选手相关
- 选手熟练度：${request.analysisSignals.playerRelated.proficiencyScore}/100
- 使用率：${request.analysisSignals.playerRelated.usageRate}%
- 是否招牌英雄：${request.analysisSignals.playerRelated.isSignature ? '是' : '否'}
- 近期胜率：${request.analysisSignals.playerRelated.recentWinRate}%
- 近期使用频率：${request.analysisSignals.playerRelated.recencyScore}/100

### 英雄强度与环境
- 英雄强度：${request.analysisSignals.heroStrength.heroStrength}/100
- 版本等级：${request.analysisSignals.heroStrength.metaTier}
- 职业比赛出场率：${request.analysisSignals.heroStrength.presenceRate}%
- 优先级评分：${request.analysisSignals.heroStrength.priorityScore}/100

### 体系与战术
- 体系适配度：${request.analysisSignals.systemTactical.systemFitScore}/100
- 体系名称：${request.analysisSignals.systemTactical.systemName || '未识别'}
- 与已选英雄的协同度：${request.analysisSignals.systemTactical.synergyScore}/100
- 协同英雄：${request.analysisSignals.systemTactical.synergyChampions.join('、') || '无'}

### 阵容关系
- 是否克制敌方已选英雄：${request.analysisSignals.compositionRelation.countersEnemyPicks ? '是' : '否'}
- 克制目标：${request.analysisSignals.compositionRelation.counterTargets.join('、') || '无'}
- 是否被敌方已选英雄克制：${request.analysisSignals.compositionRelation.counteredByEnemy ? '是' : '否'}
- 被克制程度：${request.analysisSignals.compositionRelation.counteredScore}/100
- 是否填补我方阵容缺口：${request.analysisSignals.compositionRelation.fillsGap ? '是' : '否'}
- 缺口类型：${request.analysisSignals.compositionRelation.gapType || '无'}

### 阶段因素
- 当前是第几轮 Pick：第${request.analysisSignals.phaseFactors.pickRound}轮
- 如果不在本轮选择，敌方是否可能抢夺：${request.analysisSignals.phaseFactors.enemyMightContest ? '是' : '否'}
- 被抢风险程度：${request.analysisSignals.phaseFactors.contestScore}/100
- 延后选择的风险程度：${request.analysisSignals.phaseFactors.delayRisk}/100
`;

  // 3. 调用 AI API
  const response = await callAIAPI({
    systemPrompt,
    userInput,
    temperature: 0.7,
    maxTokens: 500
  });

  // 4. 解析输出（按行分割）
  const reasons = response.trim().split('\n').filter(line => line.trim());

  return reasons;
}

// 使用示例
const request: PickReasonRequest = {
  bpState: {
    step: 4,
    phase: "pick2",
    side: "红色方",
    ourBans: ["剑姬", "卡莉丝塔", "维鲁斯"],
    enemyBans: ["阿卡丽", "妖姬", "佐伊"],
    ourPicks: ["奥恩"],
    enemyPicks: ["盲僧", "锤石"],
    remainingPositions: ["中单", "打野", "ADC", "辅助"]
  },
  pickTarget: {
    championName: "阿兹尔",
    positionName: "中单",
    playerName: "Chovy"
  },
  analysisSignals: {
    playerRelated: {
      proficiencyScore: 95,
      usageRate: 42,
      isSignature: true,
      recentWinRate: 78,
      recencyScore: 85
    },
    heroStrength: {
      heroStrength: 86,
      metaTier: "T0",
      presenceRate: 82,
      priorityScore: 88
    },
    systemTactical: {
      systemFitScore: 82,
      systemName: "中期团战体系",
      synergyScore: 80,
      synergyChampions: ["奥恩"]
    },
    compositionRelation: {
      countersEnemyPicks: true,
      counterTargets: ["盲僧"],
      counteredByEnemy: false,
      counteredScore: 20,
      fillsGap: true,
      gapType: "持续输出"
    },
    phaseFactors: {
      pickRound: 2,
      enemyMightContest: true,
      contestScore: 85,
      delayRisk: 80
    }
  }
};

const reasons = await generatePickReasons(request);
console.log(reasons);
// 输出：
// [
//   "Chovy的招牌阿兹尔（熟练度95分，近期胜率78%）",
//   "版本T0级强势英雄（强度86分），本轮不选敌方可能抢夺（被抢风险85分）",
//   "完成中期团战体系核心，与已选奥恩形成强势配合（协同度80分）",
//   "克制敌方已选的盲僧，限制其节奏型打法",
//   "填补我方持续输出缺口，完善团队功能结构"
// ]
```

## 关键要点

1. **完整数据传递**：必须传递所有 prompt 中定义的数据字段
2. **格式化输入**：将结构化数据转换为自然语言描述
3. **系统提示词**：将 prompt 文档作为系统提示词
4. **输出解析**：AI 输出是按行分隔的理由列表
5. **温度参数**：建议使用 0.7 左右的温度
