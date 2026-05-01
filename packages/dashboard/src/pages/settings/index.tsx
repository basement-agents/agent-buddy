import { useState, useEffect } from "react";
import { Button } from "~/components/system/button";
import { Input } from "~/components/system/input";
import { Badge } from "~/components/system/badge";
import { useToast } from "~/components/system/toast";
import { Label } from "~/components/system/label";
import { Checkbox } from "~/components/system/checkbox";
import { NativeSelect } from "~/components/system/native-select";
import { api } from "~/lib/api";
import type { CustomRule, LLMTestResult } from "~/lib/api";
import { useRepos } from "~/lib/hooks";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { Spinner } from "~/components/system/spinner";
import { PageColumn } from "~/components/common/page-column";
import { FeedList, FeedItem } from "~/components/common/feed-list";

// ─── Section primitive ────────────────────────────────────────────────────────
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
      <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", margin: 0 }}>
        {title}
      </p>
      <FeedList>{children}</FeedList>
    </section>
  );
}

// ─── Row primitive ────────────────────────────────────────────────────────────
function SettingsRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <FeedItem
      title={<span style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-primary)" }}>{label}</span>}
      trailing={<div style={{ minWidth: 200, maxWidth: 300 }}>{children}</div>}
    />
  );
}

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

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const settings = await api.getSettings();
        if (cancelled) return;

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
        if (cancelled) return;
        console.error("Failed to load settings:", err);
        showToast({ title: "Failed to load settings", variant: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSettings();
    return () => { cancelled = true; };
  }, [showToast]);

  useEffect(() => {
    if (!selectedRepoId) {
      setCustomRules([]);
      return;
    }
    let cancelled = false;
    const loadRules = async () => {
      setRulesLoading(true);
      try {
        const rules = await api.getRepoRules(selectedRepoId);
        if (!cancelled) setCustomRules(rules);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load custom rules:", err);
        showToast({ title: "Failed to load custom rules", variant: "error" });
      } finally {
        if (!cancelled) setRulesLoading(false);
      }
    };

    loadRules();
    return () => { cancelled = true; };
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
      setCustomRules((prev) => [...prev, rule]);
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
      setCustomRules((prev) => prev.filter((r) => r.id !== deleteRuleId));
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
      setCustomRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
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
    <PageColumn variant="feed">
      <div>
        <h1 style={{ fontSize: "var(--ds-text-xl, 22px)", fontWeight: 700, color: "var(--ds-color-text-primary)", margin: 0 }}>Settings</h1>
        <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>Configure agent-buddy</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
          <span className="sr-only">Loading settings...</span>
          <Spinner size="medium" />
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-12)" }}
        >
          {(!repos || repos.data.length === 0) && (
            <div style={{ borderRadius: "var(--ds-radius-3)", border: "1px solid var(--ds-color-border-primary)", background: "var(--ds-color-surface-secondary)", padding: "var(--ds-spacing-8)" }}>
              <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", margin: 0 }}>
                No repositories configured yet. Add a repository to get started with automatic code reviews.
              </p>
              <a href="/repos" style={{ display: "inline-block", marginTop: 8, fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-interactive-accent)" }}>
                Go to Repos &rarr;
              </a>
            </div>
          )}

          {/* GitHub Connection */}
          <SettingsSection title="GitHub Connection">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                <Label htmlFor="settings-github-token">GitHub Personal Access Token</Label>
                <Input
                  id="settings-github-token"
                  type="password"
                  placeholder="ghp_..."
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
                <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", margin: 0 }}>
                  Requires repo and pull_request read permissions
                </p>
              </div>
            </FeedItem>
          </SettingsSection>

          {/* LLM Provider */}
          <SettingsSection title="LLM Provider">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label htmlFor="settings-llm-provider">Provider</Label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: llmApiKey ? "var(--ds-color-feedback-success-subtle)" : "var(--ds-color-feedback-warning-subtle)", flexShrink: 0 }} />
                    <span style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)" }}>
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
                  <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>
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
                  <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>Leave empty to use provider default</p>
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
                    <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>Custom endpoint for OpenAI-compatible APIs</p>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                      } catch {
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
              </div>
            </FeedItem>
          </SettingsSection>

          {/* Server Configuration */}
          <SettingsSection title="Server Configuration">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                <div>
                  <Label htmlFor="settings-server-port">Server Port</Label>
                  <Input id="settings-server-port" value={serverPort} onChange={(e) => setServerPort(e.target.value)} onBlur={() => validate("port", serverPort)} />
                  {errors.port && <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-feedback-danger)", marginTop: 4 }}>{errors.port}</p>}
                </div>
                <div>
                  <Label htmlFor="settings-server-host">Server Host</Label>
                  <Input id="settings-server-host" placeholder="0.0.0.0" value={serverHost} onChange={(e) => setServerHost(e.target.value)} onBlur={() => validate("host", serverHost)} />
                  {errors.host && <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-feedback-danger)", marginTop: 4 }}>{errors.host}</p>}
                </div>
                <div>
                  <Label htmlFor="settings-webhook-secret">Webhook Secret</Label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Input
                      id="settings-webhook-secret"
                      type="password"
                      placeholder="Leave empty to disable signature verification"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      style={{ flex: 1 }}
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
              </div>
            </FeedItem>
          </SettingsSection>

          {/* Review Settings */}
          <SettingsSection title="Review Settings">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                <div>
                  <Label htmlFor="settings-max-comments">Max Comments per Review</Label>
                  <Input
                    id="settings-max-comments"
                    type="number"
                    value={maxComments}
                    onChange={(e) => setMaxComments(e.target.value)}
                    onBlur={() => validate("maxComments", maxComments)}
                  />
                  {errors.maxComments && <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-feedback-danger)", marginTop: 4 }}>{errors.maxComments}</p>}
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label htmlFor="settings-auto-approve" style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-secondary)" }}>Auto-approve Low Severity</label>
                  <Checkbox
                    id="settings-auto-approve"
                    checked={autoApproveBelow}
                    onChange={(s) => setAutoApproveBelow(s === "on")}
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
                  {errors.reviewDelay && <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-feedback-danger)", marginTop: 4 }}>{errors.reviewDelay}</p>}
                  <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>Wait before posting review comments (0 = immediate)</p>
                </div>
              </div>
            </FeedItem>
          </SettingsSection>

          {/* Quiet Hours */}
          <SettingsSection title="Quiet Hours">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label htmlFor="settings-quiet-hours-enabled" style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-secondary)" }}>Enable Quiet Hours</label>
                  <Checkbox
                    id="settings-quiet-hours-enabled"
                    checked={quietHoursEnabled}
                    onChange={(s) => setQuietHoursEnabled(s === "on")}
                  />
                </div>
                {quietHoursEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ds-spacing-7)" }}>
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
                      <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>Reviews will not be posted during quiet hours</p>
                    </div>
                  </div>
                )}
              </div>
            </FeedItem>
          </SettingsSection>

          {/* GitHub App Configuration */}
          <SettingsSection title="GitHub App Configuration">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, borderRadius: "var(--ds-radius-3)", border: "1px solid var(--ds-color-border-primary)", padding: "var(--ds-spacing-7)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ds-color-surface-neutral)", flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>
                    GitHub App authentication is optional. Configure via the API or CLI for advanced webhook handling.
                  </span>
                </div>
                <div>
                  <h4 style={{ fontSize: "var(--ds-text-sm)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 8 }}>Benefits of GitHub App auth:</h4>
                  <ul style={{ marginLeft: 16, fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", display: "flex", flexDirection: "column", gap: 4, listStyle: "disc" }}>
                    <li>Fine-grained repository permissions</li>
                    <li>Installation-based access control</li>
                    <li>Dedicated webhook secret per installation</li>
                    <li>Better rate limits than personal access tokens</li>
                  </ul>
                </div>
                <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", margin: 0 }}>
                  Use <code style={{ borderRadius: "var(--ds-radius-1)", background: "var(--ds-color-surface-secondary)", padding: "1px 4px" }}>agent-buddy config set githubAppId &lt;id&gt;</code> to configure.
                </p>
              </div>
            </FeedItem>
          </SettingsSection>

          {/* Custom Rules */}
          <SettingsSection title="Custom Rules">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)", width: "100%" }}>
                <div>
                  <Label>Select Repository</Label>
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
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--ds-spacing-9)" }} role="status" aria-live="polite">
                        <Spinner size="medium" />
                        <span style={{ marginLeft: 8, fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>Loading rules...</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <h4 style={{ fontSize: "var(--ds-text-sm)", fontWeight: 600, color: "var(--ds-color-text-secondary)", margin: 0 }}>
                            Rules ({customRules.length})
                          </h4>
                          <Button size="sm" onClick={() => setShowAddRule(true)}>Add Rule</Button>
                        </div>

                        {customRules.length === 0 ? (
                          <div style={{ borderRadius: "var(--ds-radius-3)", border: "1px dashed var(--ds-color-border-primary)", padding: "var(--ds-spacing-8)", textAlign: "center", fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>
                            No custom rules configured
                          </div>
                        ) : (
                          <FeedList>
                            {customRules.map((rule) => (
                              <FeedItem
                                key={rule.id}
                                title={
                                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 500, color: "var(--ds-color-text-primary)" }}>{rule.name}</span>
                                    <Badge variant={rule.severity === "error" ? "error" : rule.severity === "warning" ? "warning" : "default"}>{rule.severity}</Badge>
                                    {!rule.enabled && <Badge variant="default">Disabled</Badge>}
                                  </span>
                                }
                                meta={<code style={{ fontSize: "var(--ds-text-xs)" }}>{rule.pattern}</code>}
                                trailing={
                                  <span style={{ display: "flex", gap: 4 }}>
                                    <Button variant="ghost" size="sm" onClick={() => handleToggleRule(rule)}>
                                      {rule.enabled ? "Disable" : "Enable"}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setDeleteRuleId(rule.id)}>
                                      Delete
                                    </Button>
                                  </span>
                                }
                              />
                            ))}
                          </FeedList>
                        )}

                        {showAddRule && (
                          <div style={{ borderRadius: "var(--ds-radius-3)", border: "1px solid var(--ds-color-border-primary)", padding: "var(--ds-spacing-8)" }}>
                            <h4 style={{ fontSize: "var(--ds-text-sm)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 12 }}>Add New Rule</h4>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)" }}>
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
                              <div style={{ display: "flex", gap: "var(--ds-spacing-7)" }}>
                                <NativeSelect
                                  style={{ flex: 1 }}
                                  value={newRuleSeverity}
                                  onChange={(e) => setNewRuleSeverity(e.target.value as typeof newRuleSeverity)}
                                >
                                  <option value="info">Info</option>
                                  <option value="suggestion">Suggestion</option>
                                  <option value="warning">Warning</option>
                                  <option value="error">Error</option>
                                </NativeSelect>
                                <Input
                                  style={{ flex: 1 }}
                                  placeholder="Category (optional)"
                                  value={newRuleCategory}
                                  onChange={(e) => setNewRuleCategory(e.target.value)}
                                />
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Checkbox
                                  id="rule-enabled"
                                  checked={newRuleEnabled}
                                  onChange={(s) => setNewRuleEnabled(s === "on")}
                                />
                                <label htmlFor="rule-enabled" style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>Enabled</label>
                              </div>
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <Button variant="outline" size="sm" onClick={() => setShowAddRule(false)}>Cancel</Button>
                                <Button size="sm" onClick={handleAddRule} disabled={!newRuleName || !newRulePattern}>Add Rule</Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </FeedItem>
          </SettingsSection>

          {/* Webhook Endpoint */}
          <SettingsSection title="Webhook Endpoint">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)", width: "100%" }}>
                <div>
                  <Label>Webhook URL</Label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <code style={{ flex: 1, wordBreak: "break-all", borderRadius: "var(--ds-radius-3)", border: "1px solid var(--ds-color-border-primary)", background: "var(--ds-color-surface-secondary)", padding: "var(--ds-spacing-7)", fontSize: "var(--ds-text-sm)" }}>
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

                <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: "var(--ds-radius-3)", border: "1px solid var(--ds-color-border-primary)", padding: "var(--ds-spacing-7)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: webhookSecret ? "var(--ds-color-feedback-success-subtle)" : "var(--ds-color-feedback-warning-subtle)", flexShrink: 0 }} />
                  <span style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>
                    {webhookSecret ? "Webhook secret configured" : "No webhook secret set — signatures will not be verified"}
                  </span>
                </div>
              </div>
            </FeedItem>
          </SettingsSection>

          {/* GitHub Webhook Setup */}
          <SettingsSection title="GitHub Webhook Setup">
            <FeedItem>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)", width: "100%" }}>
                <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", margin: 0 }}>
                  Configure GitHub webhooks to automatically trigger reviews when PRs are opened or when @agent-buddy is mentioned.
                </p>

                <div>
                  <h4 style={{ fontSize: "var(--ds-text-sm)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 8 }}>Setup Steps:</h4>
                  <ol style={{ marginLeft: 16, fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", display: "flex", flexDirection: "column", gap: 4 }}>
                    <li>Go to your repository Settings → Webhooks → Add webhook</li>
                    <li>Set the Payload URL to: <code style={{ borderRadius: "var(--ds-radius-1)", background: "var(--ds-color-surface-secondary)", padding: "1px 4px", fontSize: "var(--ds-text-xs)" }}>http://your-server:{serverPort}/api/webhooks/github</code></li>
                    <li>Content type: <code style={{ borderRadius: "var(--ds-radius-1)", background: "var(--ds-color-surface-secondary)", padding: "1px 4px", fontSize: "var(--ds-text-xs)" }}>application/json</code></li>
                    <li>Secret: Set the same value as Webhook Secret above (optional but recommended)</li>
                    <li>Select events: <span style={{ fontWeight: 500 }}>Pull requests, Pull request reviews, Issue comments</span></li>
                    <li>Click "Add webhook"</li>
                  </ol>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  onClick={() => setWebhookExpanded(!webhookExpanded)}
                >
                  {webhookExpanded ? "▼ Hide" : "▶ Show"} webhook URL format and payload example
                </Button>

                {webhookExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)", borderRadius: "var(--ds-radius-3)", border: "1px solid var(--ds-color-border-primary)", background: "var(--ds-color-surface-secondary)", padding: "var(--ds-spacing-7)" }}>
                    <div>
                      <h5 style={{ fontSize: "var(--ds-text-xs)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Webhook URL Format:</h5>
                      <code style={{ display: "block", borderRadius: "var(--ds-radius-2)", background: "var(--ds-color-surface-neutral)", padding: 8, fontSize: "var(--ds-text-xs)" }}>
                        POST http://your-server:{serverPort}/api/webhooks/github
                      </code>
                    </div>
                    <div>
                      <h5 style={{ fontSize: "var(--ds-text-xs)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Headers:</h5>
                      <code style={{ display: "block", borderRadius: "var(--ds-radius-2)", background: "var(--ds-color-surface-neutral)", padding: 8, fontSize: "var(--ds-text-xs)" }}>
                        X-GitHub-Event: pull_request<br />
                        X-Hub-Signature-256: sha256=...<br />
                        Content-Type: application/json
                      </code>
                    </div>
                    <div>
                      <h5 style={{ fontSize: "var(--ds-text-xs)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Example Payload (pull_request):</h5>
                      <pre style={{ overflowX: "auto", borderRadius: "var(--ds-radius-2)", background: "var(--ds-color-surface-neutral)", padding: 8, fontSize: "var(--ds-text-xs)", margin: 0 }}>
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
                      <h5 style={{ fontSize: "var(--ds-text-xs)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Triggering with @agent-buddy:</h5>
                      <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)", margin: 0 }}>
                        Add a comment on a PR or review containing <code style={{ borderRadius: "var(--ds-radius-1)", background: "var(--ds-color-surface-neutral)", padding: "1px 4px" }}>@agent-buddy</code> to trigger an on-demand review.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </FeedItem>
          </SettingsSection>

          <Button type="submit" disabled={saving || loading || Object.values(errors).some(Boolean)}>
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
        </form>
      )}
    </PageColumn>
  );
}
