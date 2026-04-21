import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import type { CustomRule, SettingsData, LLMTestResult } from "@/lib/api";
import { useRepos } from "@/lib/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function SettingsPage() {
  const [githubToken, setGithubToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [serverPort, setServerPort] = useState("3000");
  const [serverHost, setServerHost] = useState("0.0.0.0");
  const [maxComments, setMaxComments] = useState("50");
  const [defaultSeverity, setDefaultSeverity] = useState<"info" | "suggestion" | "warning" | "error">("suggestion");
  const [autoApproveBelow, setAutoApproveBelow] = useState(false);
  const [reviewDelaySeconds, setReviewDelaySeconds] = useState("0");
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [quietHoursTimezone, setQuietHoursTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webhookExpanded, setWebhookExpanded] = useState(false);

  // LLM Provider state
  const [llmProvider, setLlmProvider] = useState<"anthropic" | "openrouter" | "openai">("anthropic");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmDefaultModel, setLlmDefaultModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmTestResult, setLlmTestResult] = useState<LLMTestResult | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (field: string, value: string) => {
    let msg = "";
    switch (field) {
      case "port": {
        const n = parseInt(value, 10);
        if (!value || isNaN(n)) msg = "Port is required";
        else if (n < 1 || n > 65535) msg = "Port must be between 1 and 65535";
        break;
      }
      case "host":
        if (!value.trim()) msg = "Host is required";
        break;
      case "maxComments": {
        const n = parseInt(value, 10);
        if (!value || isNaN(n)) msg = "Max comments is required";
        else if (n < 1 || n > 500) msg = "Must be between 1 and 500";
        break;
      }
      case "reviewDelay": {
        const n = parseInt(value, 10);
        if (value && (isNaN(n) || n < 0 || n > 3600)) msg = "Must be between 0 and 3600";
        break;
      }
    }
    setErrors((prev) => msg ? { ...prev, [field]: msg } : { ...prev, [field]: "" });
    return !msg;
  };

  const validateAll = () => {
    const results = [
      validate("port", serverPort),
      validate("host", serverHost),
      validate("maxComments", maxComments),
      validate("reviewDelay", reviewDelaySeconds),
    ];
    return results.every(Boolean);
  };

  // Custom Rules state
  const { data: repos } = useRepos();
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleSeverity, setNewRuleSeverity] = useState<"info" | "suggestion" | "warning" | "error">("suggestion");
  const [newRuleEnabled, setNewRuleEnabled] = useState(true);
  const [newRuleCategory, setNewRuleCategory] = useState("");

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await api.getSettings();

        if (settings.githubToken && settings.githubToken !== "not set") {
          setGithubToken(settings.githubToken);
        }

        if (settings.server) {
          setServerPort(String(settings.server.port));
          setServerHost(settings.server.host || "0.0.0.0");
          setWebhookSecret(settings.server.webhookSecret || "");
        }

        if (settings.review) {
          setMaxComments(String(settings.review.maxComments));
          setDefaultSeverity(settings.review.defaultSeverity);
          setAutoApproveBelow(settings.review.autoApproveBelow);
          setReviewDelaySeconds(String(settings.review.reviewDelaySeconds));
          if (settings.review.quietHours) {
            setQuietHoursEnabled(true);
            setQuietHoursStart(settings.review.quietHours.start);
            setQuietHoursEnd(settings.review.quietHours.end);
            setQuietHoursTimezone(settings.review.quietHours.timezone);
          }
        }

        if (settings.llm) {
          setLlmProvider(settings.llm.provider);
          if (settings.llm.defaultModel) setLlmDefaultModel(settings.llm.defaultModel);
          if (settings.llm.baseUrl) setLlmBaseUrl(settings.llm.baseUrl);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        showToast({ title: "Failed to load settings", variant: "error" });
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [showToast]);

  // Load custom rules when repo is selected
  useEffect(() => {
    const loadRules = async () => {
      if (!selectedRepoId) {
        setCustomRules([]);
        return;
      }
      setRulesLoading(true);
      try {
        const rules = await api.getRepoRules(selectedRepoId);
        setCustomRules(rules);
      } catch (err) {
        console.error("Failed to load custom rules:", err);
        showToast({ title: "Failed to load custom rules", variant: "error" });
      } finally {
        setRulesLoading(false);
      }
    };

    loadRules();
  }, [selectedRepoId, showToast]);

  const handleAddRule = async () => {
    if (!selectedRepoId || !newRuleName || !newRulePattern) {
      showToast({ title: "Please fill in all required fields", variant: "warning" });
      return;
    }
    try {
      const rule = await api.addRepoRule(selectedRepoId, {
        name: newRuleName,
        pattern: newRulePattern,
        severity: newRuleSeverity,
        enabled: newRuleEnabled,
        category: newRuleCategory || undefined,
      });
      setCustomRules([...customRules, rule]);
      setNewRuleName("");
      setNewRulePattern("");
      setNewRuleSeverity("suggestion");
      setNewRuleEnabled(true);
      setNewRuleCategory("");
      setShowAddRule(false);
      showToast({ title: "Rule added successfully", variant: "success" });
    } catch (err) {
      console.error("Failed to add rule:", err);
      showToast({ title: "Failed to add rule", variant: "error" });
    }
  };

  const handleDeleteRule = async () => {
    if (!selectedRepoId || !deleteRuleId) return;
    try {
      await api.deleteRepoRule(selectedRepoId, deleteRuleId);
      setCustomRules(customRules.filter((r) => r.id !== deleteRuleId));
      showToast({ title: "Rule deleted", variant: "success" });
    } catch (err) {
      console.error("Failed to delete rule:", err);
      showToast({ title: "Failed to delete rule", variant: "error" });
    } finally {
      setDeleteRuleId(null);
    }
  };

  const handleToggleRule = async (rule: CustomRule) => {
    if (!selectedRepoId) return;
    try {
      const updated = await api.addRepoRule(selectedRepoId, {
        ...rule,
        enabled: !rule.enabled,
      });
      setCustomRules(customRules.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err) {
      console.error("Failed to update rule:", err);
      showToast({ title: "Failed to update rule", variant: "error" });
    }
  };

  const handleSave = async () => {
    if (!validateAll()) return;
    setSaving(true);
    try {
      await api.updateSettings({
        githubToken,
        server: {
          port: parseInt(serverPort, 10),
          host: serverHost,
          webhookSecret,
        },
        review: {
          maxComments: parseInt(maxComments, 10),
          defaultSeverity,
          autoApproveBelow,
          reviewDelaySeconds: parseInt(reviewDelaySeconds, 10),
          quietHours: quietHoursEnabled ? { start: quietHoursStart, end: quietHoursEnd, timezone: quietHoursTimezone } : undefined,
        },
        llm: {
          provider: llmProvider,
          apiKey: llmApiKey || undefined,
          defaultModel: llmDefaultModel || undefined,
          baseUrl: llmBaseUrl || undefined,
        },
      });

      showToast({ title: "Settings saved", variant: "success" });
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast({ title: "Failed to save settings. Is the server running?", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h1>
        <p className="text-sm text-zinc-500">Configure agent-buddy</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-zinc-500">Loading settings...</div>
        </div>
      ) : (
        <>
      {(!repos || repos.data.length === 0) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            No repositories configured yet. Add a repository to get started with automatic code reviews.
          </p>
          <a href="/repos" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Go to Repos &rarr;
          </a>
        </div>
      )}

      <Card aria-labelledby="settings-github">
        <CardHeader>
          <CardTitle className="text-base" id="settings-github">GitHub Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="settings-github-token">
              GitHub Personal Access Token
            </Label>
            <Input
              id="settings-github-token"
              type="password"
              placeholder="ghp_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Requires repo and pull_request read permissions
            </p>
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-llm">
        <CardHeader>
          <CardTitle className="text-base" id="settings-llm">LLM Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="settings-llm-provider">Provider</Label>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${llmApiKey ? "bg-green-500" : "bg-yellow-500"} shrink-0`} />
              <span className="text-xs text-zinc-500">
                {llmApiKey ? "API key configured" : "No API key set"}
              </span>
            </div>
          </div>
          <NativeSelect
            id="settings-llm-provider"
            value={llmProvider}
            onChange={(e) => {
              setLlmProvider(e.target.value as typeof llmProvider);
              setLlmTestResult(null);
            }}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
          </NativeSelect>

          <div>
            <Label htmlFor="settings-llm-api-key">API Key</Label>
            <Input
              id="settings-llm-api-key"
              type="password"
              placeholder={llmProvider === "anthropic" ? "sk-ant-..." : llmProvider === "openrouter" ? "sk-or-..." : "sk-..."}
              value={llmApiKey}
              onChange={(e) => {
                setLlmApiKey(e.target.value);
                setLlmTestResult(null);
              }}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {llmProvider === "anthropic" && "Leave empty to use ANTHROPIC_API_KEY environment variable"}
              {llmProvider === "openrouter" && "Leave empty to use OPENROUTER_API_KEY environment variable"}
              {llmProvider === "openai" && "Leave empty to use OPENAI_API_KEY environment variable"}
            </p>
          </div>

          <div>
            <Label htmlFor="settings-llm-model">Default Model</Label>
            <Input
              id="settings-llm-model"
              placeholder={
                llmProvider === "anthropic" ? "claude-sonnet-4-20250514" :
                llmProvider === "openrouter" ? "anthropic/claude-sonnet-4-20250514" :
                "gpt-4o"
              }
              value={llmDefaultModel}
              onChange={(e) => setLlmDefaultModel(e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">Leave empty to use provider default</p>
          </div>

          {llmProvider === "openai" && (
            <div>
              <Label htmlFor="settings-llm-base-url">Base URL</Label>
              <Input
                id="settings-llm-base-url"
                placeholder="https://api.openai.com/v1/chat/completions"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">Custom endpoint for OpenAI-compatible APIs (e.g., Azure, local models)</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={llmTesting}
              onClick={async () => {
                setLlmTesting(true);
                setLlmTestResult(null);
                try {
                  await handleSave();
                  const result = await api.testLLM();
                  setLlmTestResult(result);
                  showToast({
                    title: result.success ? `Connection OK (${result.latencyMs}ms)` : `Connection failed: ${result.error}`,
                    variant: result.success ? "success" : "error",
                  });
                } catch (err) {
                  setLlmTestResult({ success: false, error: "Request failed" });
                  showToast({ title: "Failed to test connection", variant: "error" });
                } finally {
                  setLlmTesting(false);
                }
              }}
            >
              {llmTesting ? "Testing..." : "Test Connection"}
            </Button>
            {llmTestResult && (
              <Badge variant={llmTestResult.success ? "default" : "error"}>
                {llmTestResult.success ? `${llmTestResult.latencyMs}ms` : llmTestResult.error}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-server">
        <CardHeader>
          <CardTitle className="text-base" id="settings-server">Server Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="settings-server-port">Server Port</Label>
            <Input id="settings-server-port" value={serverPort} onChange={(e) => setServerPort(e.target.value)} onBlur={() => validate("port", serverPort)} />
            {errors.port && <p className="mt-1 text-xs text-red-500">{errors.port}</p>}
          </div>
          <div>
            <Label htmlFor="settings-server-host">Server Host</Label>
            <Input id="settings-server-host" placeholder="0.0.0.0" value={serverHost} onChange={(e) => setServerHost(e.target.value)} onBlur={() => validate("host", serverHost)} />
            {errors.host && <p className="mt-1 text-xs text-red-500">{errors.host}</p>}
          </div>
          <div>
            <Label htmlFor="settings-webhook-secret">Webhook Secret</Label>
            <div className="flex items-center gap-2">
              <Input
                id="settings-webhook-secret"
                type="password"
                placeholder="Leave empty to disable signature verification"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const secret = crypto.randomUUID();
                  setWebhookSecret(secret);
                  navigator.clipboard.writeText(secret);
                  showToast({ title: "Secret generated and copied", variant: "success" });
                }}
              >
                Generate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-review">
        <CardHeader>
          <CardTitle className="text-base" id="settings-review">Review Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="settings-max-comments">Max Comments per Review</Label>
            <Input
              id="settings-max-comments"
              type="number"
              value={maxComments}
              onChange={(e) => setMaxComments(e.target.value)}
              onBlur={() => validate("maxComments", maxComments)}
            />
            {errors.maxComments && <p className="mt-1 text-xs text-red-500">{errors.maxComments}</p>}
          </div>
          <div>
            <Label htmlFor="settings-default-severity">Default Severity</Label>
            <NativeSelect
              id="settings-default-severity"
              value={defaultSeverity}
              onChange={(e) => setDefaultSeverity(e.target.value as typeof defaultSeverity)}
            >
              <option value="info">Info</option>
              <option value="suggestion">Suggestion</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </NativeSelect>
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="settings-auto-approve" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Auto-approve Low Severity</label>
            <Checkbox
              id="settings-auto-approve"
              checked={autoApproveBelow}
              onChange={(e) => setAutoApproveBelow(e.target.checked)}
            />
          </div>
          <div>
            <Label htmlFor="settings-review-delay">Review Delay (seconds)</Label>
            <Input
              id="settings-review-delay"
              type="number"
              min="0"
              value={reviewDelaySeconds}
              onChange={(e) => setReviewDelaySeconds(e.target.value)}
              onBlur={() => validate("reviewDelay", reviewDelaySeconds)}
            />
            {errors.reviewDelay && <p className="mt-1 text-xs text-red-500">{errors.reviewDelay}</p>}
            <p className="mt-1 text-xs text-zinc-500">Wait before posting review comments (0 = immediate)</p>
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-quiet-hours">
        <CardHeader>
          <CardTitle className="text-base" id="settings-quiet-hours">Quiet Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="settings-quiet-hours-enabled" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Enable Quiet Hours</label>
            <Checkbox
              id="settings-quiet-hours-enabled"
              checked={quietHoursEnabled}
              onChange={(e) => setQuietHoursEnabled(e.target.checked)}
            />
          </div>
          {quietHoursEnabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="settings-qh-start">Start Time</Label>
                  <Input id="settings-qh-start" type="time" value={quietHoursStart} onChange={(e) => setQuietHoursStart(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="settings-qh-end">End Time</Label>
                  <Input id="settings-qh-end" type="time" value={quietHoursEnd} onChange={(e) => setQuietHoursEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="settings-qh-tz">Timezone</Label>
                <Input id="settings-qh-tz" placeholder="America/New_York" value={quietHoursTimezone} onChange={(e) => setQuietHoursTimezone(e.target.value)} />
                <p className="mt-1 text-xs text-zinc-500">Reviews will not be posted during quiet hours</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-github-app">
        <CardHeader>
          <CardTitle className="text-base" id="settings-github-app">GitHub App Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:gap-2">
            <div className="h-2 w-2 rounded-full bg-zinc-300 shrink-0" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              GitHub App authentication is optional. Configure via the API or CLI for advanced webhook handling.
            </span>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Benefits of GitHub App auth:</h4>
            <ul className="ml-4 list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <li>Fine-grained repository permissions</li>
              <li>Installation-based access control</li>
              <li>Dedicated webhook secret per installation</li>
              <li>Better rate limits than personal access tokens</li>
            </ul>
          </div>
          <p className="text-xs text-zinc-500">
            Use <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">agent-buddy config set githubAppId &lt;id&gt;</code> to configure.
          </p>
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-custom-rules">
        <CardHeader>
          <CardTitle className="text-base" id="settings-custom-rules">Custom Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>
              Select Repository
            </Label>
            <NativeSelect
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
            >
              <option value="">Select a repository...</option>
              {repos?.data?.map((r) => (
                <option key={r.id} value={r.id}>{r.id}</option>
              ))}
            </NativeSelect>
          </div>

          {selectedRepoId && (
            <>
              {rulesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-zinc-500">Loading rules...</div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Rules ({customRules.length})
                    </h4>
                    <Button size="sm" onClick={() => setShowAddRule(true)}>
                      Add Rule
                    </Button>
                  </div>

                  {customRules.length === 0 ? (
                    <div className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
                      No custom rules configured
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-900 dark:text-white">{rule.name}</span>
                              <Badge variant={rule.severity === "error" ? "error" : rule.severity === "warning" ? "warning" : "default"}>
                                {rule.severity}
                              </Badge>
                              {!rule.enabled && (
                                <Badge variant="default">Disabled</Badge>
                              )}
                            </div>
                            <code className="mt-1 block text-xs text-zinc-500">{rule.pattern}</code>
                            {rule.category && (
                              <span className="mt-1 text-xs text-zinc-400">Category: {rule.category}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleRule(rule)}
                            >
                              {rule.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setDeleteRuleId(rule.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {showAddRule && (
                    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
                      <h4 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add New Rule</h4>
                      <div className="space-y-3">
                        <Input
                          placeholder="Rule name (e.g., 'No console.log')"
                          value={newRuleName}
                          onChange={(e) => setNewRuleName(e.target.value)}
                        />
                        <Input
                          placeholder="Pattern (regex or string)"
                          value={newRulePattern}
                          onChange={(e) => setNewRulePattern(e.target.value)}
                        />
                        <div className="flex gap-3">
                          <NativeSelect
                            className="flex-1"
                            value={newRuleSeverity}
                            onChange={(e) => setNewRuleSeverity(e.target.value as typeof newRuleSeverity)}
                          >
                            <option value="info">Info</option>
                            <option value="suggestion">Suggestion</option>
                            <option value="warning">Warning</option>
                            <option value="error">Error</option>
                          </NativeSelect>
                          <Input
                            className="flex-1"
                            placeholder="Category (optional)"
                            value={newRuleCategory}
                            onChange={(e) => setNewRuleCategory(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="rule-enabled"
                            checked={newRuleEnabled}
                            onChange={(e) => setNewRuleEnabled(e.target.checked)}
                          />
                          <label htmlFor="rule-enabled" className="text-sm text-zinc-700 dark:text-zinc-300">
                            Enabled
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setShowAddRule(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleAddRule} disabled={!newRuleName || !newRulePattern}>
                            Add Rule
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-webhook">
        <CardHeader>
          <CardTitle className="text-base" id="settings-webhook">Webhook Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Webhook URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <code className="flex-1 break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                http://localhost:{serverPort}/api/webhooks/github
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(`http://localhost:${serverPort}/api/webhooks/github`);
                  showToast({ title: "Webhook URL copied to clipboard", variant: "success" });
                }}
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:gap-2">
            <div className={`h-2 w-2 rounded-full ${webhookSecret ? "bg-green-500" : "bg-yellow-500"} shrink-0`} />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {webhookSecret ? "Webhook secret configured" : "No webhook secret set — signatures will not be verified"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="settings-webhook-setup">
        <CardHeader>
          <CardTitle className="text-base" id="settings-webhook-setup">GitHub Webhook Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Configure GitHub webhooks to automatically trigger reviews when PRs are opened or when @agent-buddy is mentioned.
          </p>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Setup Steps:</h4>
            <ol className="ml-4 list-decimal space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <li>Go to your repository Settings → Webhooks → Add webhook</li>
              <li>Set the Payload URL to: <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">http://your-server:{serverPort}/api/webhooks/github</code></li>
              <li>Content type: <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">application/json</code></li>
              <li>Secret: Set the same value as Webhook Secret above (optional but recommended)</li>
              <li>Select events: <span className="font-medium">Pull requests, Pull request reviews, Issue comments</span></li>
              <li>Click "Add webhook"</li>
            </ol>
          </div>

          <button
            type="button"
            onClick={() => setWebhookExpanded(!webhookExpanded)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {webhookExpanded ? "▼ Hide" : "▶ Show"} webhook URL format and payload example
          </button>

          {webhookExpanded && (
            <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <h5 className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Webhook URL Format:</h5>
                <code className="block rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                  POST http://your-server:{serverPort}/api/webhooks/github
                </code>
              </div>
              <div>
                <h5 className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Headers:</h5>
                <code className="block rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                  X-GitHub-Event: pull_request<br />
                  X-Hub-Signature-256: sha256=...<br />
                  Content-Type: application/json
                </code>
              </div>
              <div>
                <h5 className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Example Payload (pull_request):</h5>
                <pre className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
{`{
  "action": "opened",
  "repository": {
    "name": "my-repo",
    "owner": { "login": "owner" }
  },
  "pull_request": {
    "number": 123,
    "title": "Add new feature",
    "body": "Please review this PR"
  }
}`}
                </pre>
              </div>
              <div>
                <h5 className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Triggering with @agent-buddy:</h5>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Add a comment on a PR or review containing <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">@agent-buddy</code> to trigger an on-demand review.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || loading || Object.values(errors).some(Boolean)}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>

      <ConfirmDialog
        open={!!deleteRuleId}
        onOpenChange={(open) => !open && setDeleteRuleId(null)}
        title="Delete Rule"
        description="Are you sure you want to delete this custom rule? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteRule}
      />
        </>
      )}
    </div>
  );
}
