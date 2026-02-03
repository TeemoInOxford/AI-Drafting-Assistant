# Ban 推荐理由生成 - 实际调用示例

## 场景描述
第一轮 Ban 阶段，我方是蓝色方，需要 Ban 掉敌方上单选手 Zeus 的剑姬。

## 输入数据（JSON 格式）

```json
{
  "bpState": {
    "step": 1,
    "phase": "ban1",
    "side": "蓝色方",
    "ourBans": [],
    "enemyBans": [],
    "ourPicks": [],
    "enemyPicks": []
  },
  "banTarget": {
    "championName": "剑姬",
    "positionName": "上单",
    "playerName": "Zeus"
  },
  "analysisSignals": {
    "playerRelated": {
      "proficiencyScore": 92,
      "usageRate": 35,
      "isSignature": true,
      "compressionScore": 85,
      "alternatives": ["杰斯", "刀妹"]
    },
    "heroStrength": {
      "heroStrength": 82,
      "metaTier": "T1",
      "presenceRate": 68
    },
    "systemTactical": {
      "systemCoreScore": 78,
      "systemName": "单带分推体系",
      "recencyScore": 88
    },
    "compositionRelation": {
      "countersOurPicks": false,
      "hardToHandle": true,
      "forcesPassivePlay": true
    },
    "phaseFactors": {
      "banRound": 1,
      "laterOpportunity": true,
      "delayRisk": 65
    }
  }
}
```

## AI Prompt 构建

将 ban-reason-prompt.md 的内容作为系统提示词，然后添加用户输入：

### System Prompt
```
[ban-reason-prompt.md 的完整内容]
```

### User Input
```
请根据以下信息生成 Ban 推荐理由：

## 当前 BP 状态
- 当前步骤：1
- Ban 阶段轮次：ban1
- 我方阵营：蓝色方
- 我方已 Ban：无
- 敌方已 Ban：无
- 我方已选：无
- 敌方已选：无

## Ban 目标
- 英雄名称：剑姬
- 目标位置：上单
- 目标选手：Zeus

## 结构化分析信号

### 敌方选手相关
- 选手熟练度：92/100
- 使用率：35%
- 是否招牌英雄：是
- 英雄池压缩度：85/100
- 替代英雄：杰斯、刀妹

### 英雄强度与环境
- 英雄强度：82/100
- 版本等级：T1
- 职业比赛出场率：68%

### 体系与战术
- 体系重要度：78/100
- 体系名称：单带分推体系
- 时效性：88/100

### 阵容关系
- 是否克制我方已选英雄：否（我方尚未选择）
- 是否是我方难以应对的英雄：是
- 是否会迫使我方后续选择变得被动：是

### 阶段因素
- 当前是第几轮 Ban：第1轮
- 如果不在本轮处理，后续是否还有机会：是
- 延后处理的风险程度：65/100
```

## AI 预期输出

```
针对Zeus的招牌剑姬（熟练度92分），压缩其上单核心英雄池
Ban后替代选择有限（压缩度85分），该位置将被严重削弱
Zeus近期频繁使用剑姬（时效性88分），避免其拿到舒适英雄
破坏敌方单带分推体系核心，削弱其战术选择
```

## 代码实现示例（TypeScript）

```typescript
interface BanReasonRequest {
  bpState: {
    step: number;
    phase: string;
    side: string;
    ourBans: string[];
    enemyBans: string[];
    ourPicks: string[];
    enemyPicks: string[];
  };
  banTarget: {
    championName: string;
    positionName: string;
    playerName?: string;
  };
  analysisSignals: {
    playerRelated: {
      proficiencyScore: number;
      usageRate: number;
      isSignature: boolean;
      compressionScore: number;
      alternatives: string[];
    };
    heroStrength: {
      heroStrength: number;
      metaTier: string;
      presenceRate: number;
    };
    systemTactical: {
      systemCoreScore: number;
      systemName?: string;
      recencyScore: number;
    };
    compositionRelation: {
      countersOurPicks: boolean;
      hardToHandle: boolean;
      forcesPassivePlay: boolean;
    };
    phaseFactors: {
      banRound: number;
      laterOpportunity: boolean;
      delayRisk: number;
    };
  };
}

async function generateBanReasons(request: BanReasonRequest): Promise<string[]> {
  // 1. 读取 ban-reason-prompt.md 作为系统提示词
  const systemPrompt = await fs.readFile('prompts/ban-reason-prompt.md', 'utf-8');

  // 2. 构建用户输入
  const userInput = `
请根据以下信息生成 Ban 推荐理由：

## 当前 BP 状态
- 当前步骤：${request.bpState.step}
- Ban 阶段轮次：${request.bpState.phase}
- 我方阵营：${request.bpState.side}
- 我方已 Ban：${request.bpState.ourBans.join('、') || '无'}
- 敌方已 Ban：${request.bpState.enemyBans.join('、') || '无'}
- 我方已选：${request.bpState.ourPicks.join('、') || '无'}
- 敌方已选：${request.bpState.enemyPicks.join('、') || '无'}

## Ban 目标
- 英雄名称：${request.banTarget.championName}
- 目标位置：${request.banTarget.positionName}
- 目标选手：${request.banTarget.playerName || '未指定'}

## 结构化分析信号

### 敌方选手相关
- 选手熟练度：${request.analysisSignals.playerRelated.proficiencyScore}/100
- 使用率：${request.analysisSignals.playerRelated.usageRate}%
- 是否招牌英雄：${request.analysisSignals.playerRelated.isSignature ? '是' : '否'}
- 英雄池压缩度：${request.analysisSignals.playerRelated.compressionScore}/100
- 替代英雄：${request.analysisSignals.playerRelated.alternatives.join('、') || '无'}

### 英雄强度与环境
- 英雄强度：${request.analysisSignals.heroStrength.heroStrength}/100
- 版本等级：${request.analysisSignals.heroStrength.metaTier}
- 职业比赛出场率：${request.analysisSignals.heroStrength.presenceRate}%

### 体系与战术
- 体系重要度：${request.analysisSignals.systemTactical.systemCoreScore}/100
- 体系名称：${request.analysisSignals.systemTactical.systemName || '未识别'}
- 时效性：${request.analysisSignals.systemTactical.recencyScore}/100

### 阵容关系
- 是否克制我方已选英雄：${request.analysisSignals.compositionRelation.countersOurPicks ? '是' : '否'}
- 是否是我方难以应对的英雄：${request.analysisSignals.compositionRelation.hardToHandle ? '是' : '否'}
- 是否会迫使我方后续选择变得被动：${request.analysisSignals.compositionRelation.forcesPassivePlay ? '是' : '否'}

### 阶段因素
- 当前是第几轮 Ban：第${request.analysisSignals.phaseFactors.banRound}轮
- 如果不在本轮处理，后续是否还有机会：${request.analysisSignals.phaseFactors.laterOpportunity ? '是' : '否'}
- 延后处理的风险程度：${request.analysisSignals.phaseFactors.delayRisk}/100
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
const request: BanReasonRequest = {
  bpState: {
    step: 1,
    phase: "ban1",
    side: "蓝色方",
    ourBans: [],
    enemyBans: [],
    ourPicks: [],
    enemyPicks: []
  },
  banTarget: {
    championName: "剑姬",
    positionName: "上单",
    playerName: "Zeus"
  },
  analysisSignals: {
    playerRelated: {
      proficiencyScore: 92,
      usageRate: 35,
      isSignature: true,
      compressionScore: 85,
      alternatives: ["杰斯", "刀妹"]
    },
    heroStrength: {
      heroStrength: 82,
      metaTier: "T1",
      presenceRate: 68
    },
    systemTactical: {
      systemCoreScore: 78,
      systemName: "单带分推体系",
      recencyScore: 88
    },
    compositionRelation: {
      countersOurPicks: false,
      hardToHandle: true,
      forcesPassivePlay: true
    },
    phaseFactors: {
      banRound: 1,
      laterOpportunity: true,
      delayRisk: 65
    }
  }
};

const reasons = await generateBanReasons(request);
console.log(reasons);
// 输出：
// [
//   "针对Zeus的招牌剑姬（熟练度92分），压缩其上单核心英雄池",
//   "Ban后替代选择有限（压缩度85分），该位置将被严重削弱",
//   "Zeus近期频繁使用剑姬（时效性88分），避免其拿到舒适英雄",
//   "破坏敌方单带分推体系核心，削弱其战术选择"
// ]
```

## 关键要点

1. **完整数据传递**：必须传递所有 prompt 中定义的数据字段，即使某些值为空或默认值
2. **格式化输入**：将结构化数据转换为自然语言描述，便于 AI 理解
3. **系统提示词**：将 prompt 文档作为系统提示词，确保 AI 遵循规范
4. **输出解析**：AI 输出是按行分隔的理由列表，需要解析处理
5. **温度参数**：建议使用 0.7 左右的温度，保持输出的多样性和准确性
