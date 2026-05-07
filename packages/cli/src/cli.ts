async function main(): Promise<void> {
  if (process.argv[2] === "__daemon__") {
    const { runDaemon } = await import("./daemon/run.js");
    await runDaemon();
    return;
  }
  const { runCli } = await import("./cli-main.js");
  await runCli();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
