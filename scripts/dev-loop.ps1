# Forward arguments without shell interpolation and preserve the process exit code.
& node (Join-Path $PSScriptRoot 'dev-loop.mjs') @args
exit $LASTEXITCODE
