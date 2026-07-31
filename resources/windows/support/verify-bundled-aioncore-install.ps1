param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,

  [Parameter(Mandatory = $true)]
  [ValidateScript({
    [string]::Equals($_, 'win32-x64', [System.StringComparison]::Ordinal) -or
      [string]::Equals($_, 'win32-arm64', [System.StringComparison]::Ordinal)
  })]
  [string]$RuntimeKey,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = 'SilentlyContinue'

$finalPathResolverSource = @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace AionUi.Install
{
    public static class FinalPathResolver
    {
        private const uint GenericRead = 0x80000000;
        private const uint FileFlagBackupSemantics = 0x02000000;
        private const uint FileFlagOpenReparsePoint = 0x00200000;
        private const uint FileAttributeDirectory = 0x00000010;
        private const uint FileAttributeReparsePoint = 0x00000400;

        [StructLayout(LayoutKind.Sequential)]
        private struct ByHandleFileInformation
        {
            public uint FileAttributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
            public uint VolumeSerialNumber;
            public uint FileSizeHigh;
            public uint FileSizeLow;
            public uint NumberOfLinks;
            public uint FileIndexHigh;
            public uint FileIndexLow;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern SafeFileHandle CreateFileW(
            string fileName,
            uint desiredAccess,
            FileShare shareMode,
            IntPtr securityAttributes,
            FileMode creationDisposition,
            uint flagsAndAttributes,
            IntPtr templateFile);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandleW(
            SafeFileHandle file,
            StringBuilder filePath,
            uint filePathLength,
            uint flags);

        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(
            SafeFileHandle file,
            out ByHandleFileInformation fileInformation);

        public static string Resolve(string path)
        {
            using (SafeFileHandle handle = Open(path, 0, FileFlagBackupSemantics))
            {
                return Resolve(handle);
            }
        }

        public static string ReadRegularFile(string rootPath, string path)
        {
            return ReadValidatedFile(rootPath, path, true);
        }

        public static string ReadContainedFile(string rootPath, string path)
        {
            return ReadValidatedFile(rootPath, path, false);
        }

        private static string ReadValidatedFile(string rootPath, string path, bool rejectReparsePoint)
        {
            using (SafeFileHandle rootHandle = Open(rootPath, 0, FileFlagBackupSemantics))
            using (SafeFileHandle handle = Open(
                path,
                GenericRead,
                FileFlagBackupSemantics | (rejectReparsePoint ? FileFlagOpenReparsePoint : 0)))
            {
                string resolvedRoot = Resolve(rootHandle);
                string resolvedPath = Resolve(handle);
                if (!IsWithin(resolvedRoot, resolvedPath))
                {
                    throw new IOException("Resolved path escapes its managed root.");
                }

                ByHandleFileInformation information;
                if (!GetFileInformationByHandle(handle, out information))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }
                if ((information.FileAttributes & FileAttributeDirectory) != 0 ||
                    (rejectReparsePoint && (information.FileAttributes & FileAttributeReparsePoint) != 0))
                {
                    throw new IOException("Path is not a regular file.");
                }

                using (FileStream stream = new FileStream(handle, FileAccess.Read))
                using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false, true), true))
                {
                    return reader.ReadToEnd();
                }
            }
        }

        private static SafeFileHandle Open(string path, uint desiredAccess, uint flags)
        {
            SafeFileHandle handle = CreateFileW(
                path,
                desiredAccess,
                FileShare.Read | FileShare.Write | FileShare.Delete,
                IntPtr.Zero,
                FileMode.Open,
                flags,
                IntPtr.Zero);
            if (handle.IsInvalid)
            {
                int error = Marshal.GetLastWin32Error();
                handle.Dispose();
                throw new Win32Exception(error);
            }
            return handle;
        }

        private static string Resolve(SafeFileHandle handle)
        {
            int capacity = 512;
            while (true)
            {
                StringBuilder buffer = new StringBuilder(capacity);
                uint length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
                if (length == 0)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }
                if (length < buffer.Capacity)
                {
                    return Normalize(buffer.ToString());
                }
                capacity = checked((int)length + 1);
            }
        }

        private static bool IsWithin(string rootPath, string candidatePath)
        {
            string root = rootPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string prefix = root + Path.DirectorySeparatorChar;
            return candidatePath.Equals(root, StringComparison.OrdinalIgnoreCase) ||
                candidatePath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }

        private static string Normalize(string path)
        {
            const string uncPrefix = @"\\?\UNC\";
            const string devicePrefix = @"\\?\";
            if (path.StartsWith(uncPrefix, StringComparison.OrdinalIgnoreCase))
            {
                return @"\\" + path.Substring(uncPrefix.Length);
            }
            if (path.StartsWith(devicePrefix, StringComparison.OrdinalIgnoreCase))
            {
                if (path.Length >= 7 && char.IsLetter(path[4]) && path[5] == ':' && path[6] == '\\')
                {
                    return path.Substring(devicePrefix.Length);
                }
                throw new IOException("Unsupported final path namespace.");
            }
            return path;
        }
    }
}
'@

try {
  if (-not ('AionUi.Install.FinalPathResolver' -as [type])) {
    Add-Type -TypeDefinition $finalPathResolverSource -Language CSharp -ErrorAction Stop
  }
  $script:FinalPathResolverAvailable = $true
} catch {
  $script:FinalPathResolverAvailable = $false
}

function Write-VerifyLog {
  param([string]$Message)
  $payload = [ordered]@{
    schemaVersion = 1
    ts = (Get-Date -Format o)
    session = ''
    version = ''
    arch = $RuntimeKey
    updated = $false
    instDir = $InstallDir
    event = 'verify-bundled-aioncore'
    message = $Message
  }
  Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ($payload | ConvertTo-Json -Compress -Depth 8)
}

function ConvertTo-RelativeResourcePath {
  param([string]$Path)
  $resourcesRoot = Join-Path $InstallDir 'resources'
  if ($Path.StartsWith($resourcesRoot, [System.StringComparison]::CurrentCultureIgnoreCase)) {
    return $Path.Substring($resourcesRoot.Length).TrimStart('\').Replace('\', '/')
  }
  return $Path.Replace('\', '/')
}

function New-Failure {
  param(
    [string]$Category,
    [string]$Component,
    [string]$Version,
    [string]$Path,
    [string]$Reason
  )

  [PSCustomObject]@{
    category  = $Category
    component = $Component
    version   = $Version
    platform  = $RuntimeKey
    path      = ConvertTo-RelativeResourcePath $Path
    reason    = $Reason
  }
}

function Test-NonEmptyFile {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$Path,
    [bool]$Executable = $false,
    [string]$ComponentRoot = '',
    [string]$InspectionPath = ''
  )

  $pathToInspect = if ($InspectionPath) { $InspectionPath } else { $Path }
  $item = Get-Item -LiteralPath $pathToInspect -ErrorAction SilentlyContinue
  if (-not $item -or $item.PSIsContainer) {
    $category = 'publish_or_install_missing'
    if ($Executable -and $ComponentRoot -and (Test-Path -LiteralPath $ComponentRoot)) {
      $category = 'possible_security_quarantine'
    }
    $Failures.Add((New-Failure $category $Component $Version $Path 'missing_file')) | Out-Null
    return $false
  }

  if ($item.Length -le 0) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'empty_file')) | Out-Null
    return $false
  }

  return $true
}

function Test-RegularManagedManifest {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Root,
    [string]$Path,
    [ref]$Contents
  )

  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if (-not $item) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $Path 'missing_file')) | Out-Null
    return $false
  }

  $isReparsePoint = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
  if (-not ($item -is [System.IO.FileInfo]) -or $item.PSIsContainer -or $isReparsePoint) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $Path 'invalid_file_type')) | Out-Null
    return $false
  }

  try {
    $resolvedRoot = [System.IO.Path]::GetFullPath($Root)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    $Contents.Value = [AionUi.Install.FinalPathResolver]::ReadRegularFile($resolvedRoot, $resolvedPath)
    return $true
  } catch {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $Path 'invalid_file_type')) | Out-Null
    return $false
  }
}

function Test-Directory {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'missing_directory')) | Out-Null
    return $false
  }

  return $true
}

function Resolve-FinalFileSystemPath {
  param([string]$Path)

  if (-not $script:FinalPathResolverAvailable) {
    return $null
  }

  try {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    return [AionUi.Install.FinalPathResolver]::Resolve($fullPath)
  } catch {
    return $null
  }
}

function Test-PathContainedWithin {
  param(
    [string]$Root,
    [string]$Candidate
  )

  $resolvedRoot = Resolve-FinalFileSystemPath $Root
  $resolvedCandidate = Resolve-FinalFileSystemPath $Candidate
  if (-not $resolvedRoot -or -not $resolvedCandidate) {
    return $false
  }
  return Test-ResolvedPathContainedWithin $resolvedRoot $resolvedCandidate
}

function Test-ResolvedPathContainedWithin {
  param(
    [string]$ResolvedRoot,
    [string]$ResolvedCandidate
  )

  try {
    $rootPath = $ResolvedRoot.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    )
    $rootPrefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
    return $ResolvedCandidate.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or
      $ResolvedCandidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Test-OrdinalStringEqual {
  param(
    [object]$Left,
    [object]$Right
  )

  if (-not ($Left -is [string]) -or -not ($Right -is [string])) {
    return $false
  }
  return [string]::Equals($Left, $Right, [System.StringComparison]::Ordinal)
}

function Test-ManagedContractFile {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$ManagedRoot,
    [string]$Path,
    [bool]$Executable = $false,
    [string]$ComponentRoot = ''
  )

  if (-not [System.IO.File]::Exists($Path)) {
    Test-NonEmptyFile $Failures $Component $Version $Path $Executable $ComponentRoot | Out-Null
    return $false
  }
  $resolvedRoot = Resolve-FinalFileSystemPath $ManagedRoot
  $resolvedPath = Resolve-FinalFileSystemPath $Path
  if (-not $resolvedRoot -or -not $resolvedPath -or -not (Test-ResolvedPathContainedWithin $resolvedRoot $resolvedPath)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'escaped_path')) | Out-Null
    return $false
  }
  return Test-NonEmptyFile $Failures $Component $Version $Path $Executable $ComponentRoot $resolvedPath
}

function Test-ManagedContractDirectory {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$ManagedRoot,
    [string]$Path
  )

  if (-not (Test-Directory $Failures $Component $Version $Path)) {
    return $false
  }
  if (-not (Test-PathContainedWithin $ManagedRoot $Path)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'escaped_path')) | Out-Null
    return $false
  }
  return $true
}

function Read-JsonFile {
  param([string]$Path)
  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Read-ManagedContractJson {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Component,
    [string]$Version,
    [string]$ManagedRoot,
    [string]$Path,
    [string]$ComponentRoot
  )

  if (-not (Test-ManagedContractFile $Failures $Component $Version $ManagedRoot $Path $false $ComponentRoot)) {
    return $null
  }

  try {
    $resolvedRoot = [System.IO.Path]::GetFullPath($ManagedRoot)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    $contents = [AionUi.Install.FinalPathResolver]::ReadContainedFile($resolvedRoot, $resolvedPath)
  } catch {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'escaped_path')) | Out-Null
    return $null
  }

  try {
    $contract = $contents | ConvertFrom-Json
  } catch {
    $contract = $null
  }
  if (-not $contract) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $Component $Version $Path 'invalid_json')) | Out-Null
    return $null
  }
  return $contract
}

function Test-ContractRelativePath {
  param([object]$Value)
  if (-not ($Value -is [string]) -or -not $Value) {
    return $false
  }
  if ($Value.Contains('\') -or [System.IO.Path]::IsPathRooted($Value)) {
    return $false
  }
  foreach ($segment in $Value.Split('/')) {
    if (-not $segment -or $segment -eq '.' -or $segment -eq '..') {
      return $false
    }
  }
  return $true
}

function Join-ContractPath {
  param(
    [string]$Root,
    [string]$RelativePath
  )
  $current = $Root
  foreach ($segment in $RelativePath.Split('/')) {
    $current = Join-Path $current $segment
  }
  return $current
}

function Read-ManagedResourcesContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$Root,
    [string]$ManifestPath
  )

  $manifestContents = $null
  if (-not (Test-RegularManagedManifest $Failures $Root $ManifestPath ([ref]$manifestContents))) {
    return $null
  }

  try {
    $contract = $manifestContents | ConvertFrom-Json
  } catch {
    $contract = $null
  }
  if (-not $contract) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManifestPath 'invalid_json')) | Out-Null
    return $null
  }
  return $contract
}

function Test-StringField {
  param(
    [object]$Object,
    [string]$Name
  )
  $value = $Object.$Name
  return ($value -is [string]) -and $value.Length -gt 0
}

function Test-StringArrayField {
  param(
    [object]$Object,
    [string]$Name
  )
  $value = $Object.$Name
  if ($null -eq $value -or $value -is [string]) {
    return $false
  }
  foreach ($entry in @($value)) {
    if (-not ($entry -is [string]) -or -not $entry) {
      return $false
    }
  }
  return $true
}

function Test-NumberField {
  param(
    [object]$Object,
    [string]$Name
  )
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $false
  }

  $value = $property.Value
  if ($null -eq $value -or $value -is [string] -or $value -is [bool]) {
    return $false
  }

  return ($value -is [byte]) -or
    ($value -is [sbyte]) -or
    ($value -is [int16]) -or
    ($value -is [uint16]) -or
    ($value -is [int]) -or
    ($value -is [uint32]) -or
    ($value -is [long]) -or
    ($value -is [uint64]) -or
    ($value -is [single]) -or
    ($value -is [double]) -or
    ($value -is [decimal])
}

function Test-ManagedNodeContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Node
  )

  if (-not $Node -or -not (Test-StringField $Node 'version') -or -not (Test-StringField $Node 'root') -or -not (Test-StringField $Node 'executable')) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'node' '' $ManagedRoot 'invalid_schema')) | Out-Null
    return
  }
  if (-not (Test-ContractRelativePath $Node.root) -or -not (Test-ContractRelativePath $Node.executable)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'node' $Node.version $ManagedRoot 'invalid_contract_path')) | Out-Null
    return
  }

  $nodeRoot = Join-ContractPath $ManagedRoot $Node.root
  Test-ManagedContractFile $Failures 'node' $Node.version $ManagedRoot (Join-ContractPath $nodeRoot $Node.executable) $true $nodeRoot | Out-Null
}

function Test-ManagedAcpToolContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Tool
  )

  $slug = $Tool.slug
  foreach ($field in @('version', 'packageName', 'root', 'platformDirectory', 'manifest', 'entrypoint', 'platformExecutable')) {
    if (-not (Test-StringField $Tool $field)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $slug '' $ManagedRoot 'invalid_schema')) | Out-Null
      return
    }
  }
  foreach ($field in @('pathEntries', 'requiredFiles', 'requiredDirectories')) {
    if (-not (Test-StringArrayField $Tool $field)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $slug $Tool.version $ManagedRoot 'invalid_schema')) | Out-Null
      return
    }
  }
  if (-not (Test-OrdinalStringEqual $Tool.platformDirectory $RuntimeKey)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $slug $Tool.version $ManagedRoot 'runtime_key_mismatch')) | Out-Null
    return
  }

  foreach ($pathValue in @($Tool.root, $Tool.manifest, $Tool.entrypoint, $Tool.platformExecutable) + @($Tool.pathEntries) + @($Tool.requiredFiles) + @($Tool.requiredDirectories)) {
    if (-not (Test-ContractRelativePath $pathValue)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $slug $Tool.version $ManagedRoot 'invalid_contract_path')) | Out-Null
      return
    }
  }

  $toolRoot = Join-ContractPath $ManagedRoot $Tool.root
  $manifestPath = Join-ContractPath $toolRoot $Tool.manifest
  $manifest = Read-ManagedContractJson $Failures $slug $Tool.version $ManagedRoot $manifestPath $toolRoot
  if ($manifest) {
    if ($manifest.entrypoint -ne $Tool.entrypoint) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $slug $Tool.version $manifestPath 'manifest_entrypoint_mismatch')) | Out-Null
    }
    $manifestPathEntries = @($manifest.path_entries)
    $contractPathEntries = @($Tool.pathEntries)
    if (($manifestPathEntries | ConvertTo-Json -Compress) -ne ($contractPathEntries | ConvertTo-Json -Compress)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $slug $Tool.version $manifestPath 'manifest_path_entries_mismatch')) | Out-Null
    }
  }

  Test-ManagedContractFile $Failures $slug $Tool.version $ManagedRoot (Join-ContractPath $toolRoot $Tool.entrypoint) $false $toolRoot | Out-Null
  foreach ($requiredFile in @($Tool.requiredFiles)) {
    Test-ManagedContractFile $Failures $slug $Tool.version $ManagedRoot (Join-ContractPath $toolRoot $requiredFile) $false $toolRoot | Out-Null
  }
  foreach ($requiredDirectory in @($Tool.requiredDirectories)) {
    Test-ManagedContractDirectory $Failures $slug $Tool.version $ManagedRoot (Join-ContractPath $toolRoot $requiredDirectory) | Out-Null
  }
  Test-ManagedContractFile $Failures $slug $Tool.version $ManagedRoot (Join-ContractPath $toolRoot $Tool.platformExecutable) $true $toolRoot | Out-Null
}

function Test-ManagedAcpToolsContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Contract
  )

  if ($null -eq $Contract.acpTools -or $Contract.acpTools -is [string]) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
    return
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $validTools = @()
  foreach ($tool in @($Contract.acpTools)) {
    if (-not $tool -or -not (Test-StringField $tool 'slug')) {
      $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
      continue
    }
    if (-not $seen.Add([string]$tool.slug)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $tool.slug $tool.version $ManagedRoot 'duplicate_tool_slug')) | Out-Null
      continue
    }
    $validTools += $tool
  }

  foreach ($requiredSlug in @('codex-acp', 'claude-agent-acp')) {
    if (-not $seen.Contains($requiredSlug)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $requiredSlug '' $ManagedRoot 'missing_required_tool')) | Out-Null
    }
  }

  foreach ($tool in $validTools) {
    Test-ManagedAcpToolContract $Failures $ManagedRoot $tool
  }
}

function Test-ManagedCliContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Cli,
    [string]$ContractRuntimeKey
  )

  if (-not $Cli -or -not (Test-StringField $Cli 'name')) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
    return
  }

  $name = $Cli.name
  foreach ($field in @('version', 'root', 'platformDirectory', 'executable')) {
    if (-not (Test-StringField $Cli $field)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $name '' $ManagedRoot 'invalid_schema')) | Out-Null
      return
    }
  }
  if (-not (Test-OrdinalStringEqual $Cli.platformDirectory $ContractRuntimeKey)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' $name $Cli.version $ManagedRoot 'runtime_key_mismatch')) | Out-Null
    return
  }

  foreach ($pathValue in @($Cli.root, $Cli.executable)) {
    if (-not (Test-ContractRelativePath $pathValue)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $name $Cli.version $ManagedRoot 'invalid_contract_path')) | Out-Null
      return
    }
  }

  foreach ($field in @('requiredFiles', 'requiredDirectories')) {
    $property = $Cli.PSObject.Properties[$field]
    if ($null -ne $property -and -not (Test-StringArrayField $Cli $field)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $name $Cli.version $ManagedRoot 'invalid_schema')) | Out-Null
      return
    }
    foreach ($pathValue in @($Cli.$field)) {
      if (-not (Test-ContractRelativePath $pathValue)) {
        $Failures.Add((New-Failure 'publish_or_install_missing' $name $Cli.version $ManagedRoot 'invalid_contract_path')) | Out-Null
        return
      }
    }
  }

  $cliRoot = Join-ContractPath $ManagedRoot $Cli.root
  if (-not (Test-ManagedContractDirectory $Failures $name $Cli.version $ManagedRoot $cliRoot)) {
    return
  }
  Test-ManagedContractFile $Failures $name $Cli.version $ManagedRoot (Join-ContractPath $cliRoot $Cli.executable) $true $cliRoot | Out-Null
  foreach ($requiredFile in @($Cli.requiredFiles)) {
    Test-ManagedContractFile $Failures $name $Cli.version $ManagedRoot (Join-ContractPath $cliRoot $requiredFile) $false $cliRoot | Out-Null
  }
  foreach ($requiredDirectory in @($Cli.requiredDirectories)) {
    Test-ManagedContractDirectory $Failures $name $Cli.version $ManagedRoot (Join-ContractPath $cliRoot $requiredDirectory) | Out-Null
  }
}

function Test-ManagedCliResourcesContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$ManagedRoot,
    [object]$Contract
  )

  if ($null -eq $Contract.clis -or $Contract.clis -is [string]) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
    return
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $validClis = @()
  foreach ($cli in @($Contract.clis)) {
    if (-not $cli -or -not (Test-StringField $cli 'name')) {
      $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $ManagedRoot 'invalid_schema')) | Out-Null
      continue
    }
    if (-not $seen.Add([string]$cli.name)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $cli.name $cli.version $ManagedRoot 'duplicate_cli_name')) | Out-Null
      continue
    }
    $validClis += $cli
  }

  foreach ($requiredName in @('claude', 'codex')) {
    if (-not $seen.Contains($requiredName)) {
      $Failures.Add((New-Failure 'publish_or_install_missing' $requiredName '' $ManagedRoot 'missing_required_cli')) | Out-Null
    }
  }

  foreach ($cli in $validClis) {
    Test-ManagedCliContract $Failures $ManagedRoot $cli $Contract.runtimeKey
  }
}

function Test-ManagedResourcesContract {
  param(
    [System.Collections.Generic.List[object]]$Failures,
    [string]$BaseDir,
    [string]$ManagedRoot
  )

  $contractPath = Join-Path $managedRoot 'manifest.json'
  $contract = Read-ManagedResourcesContract $Failures $BaseDir $contractPath
  if (-not $contract) {
    return
  }

  if (-not (Test-NumberField $contract 'schemaVersion')) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $contractPath 'invalid_schema')) | Out-Null
    return
  }
  if (-not (Test-OrdinalStringEqual $contract.runtimeKey $RuntimeKey)) {
    $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $contractPath 'runtime_key_mismatch')) | Out-Null
    return
  }

  if ([double]$contract.schemaVersion -eq 1) {
    Test-ManagedNodeContract $Failures $ManagedRoot $contract.node
    Test-ManagedAcpToolsContract $Failures $ManagedRoot $contract
    return
  }
  if ([double]$contract.schemaVersion -eq 2) {
    Test-ManagedNodeContract $Failures $ManagedRoot $contract.node
    Test-ManagedCliResourcesContract $Failures $ManagedRoot $contract
    return
  }

  $Failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $contractPath 'unsupported_schema_version')) | Out-Null
}

function Test-BundledResourcesOnce {
  $failures = [System.Collections.Generic.List[object]]::new()
  $runtimeParts = $RuntimeKey.Split('-', 2)
  $expectedPlatform = $runtimeParts[0]
  $expectedArch = $runtimeParts[1]
  $resourcesDir = Join-Path $InstallDir 'resources'
  $baseDir = Join-Path $resourcesDir "bundled-aioncore\$RuntimeKey"

  if (-not (Test-Directory $failures 'aioncore' '' $baseDir)) {
    return $failures
  }

  Test-NonEmptyFile $failures 'aioncore' '' (Join-Path $baseDir 'aioncore.exe') $true $baseDir | Out-Null

  $bundleManifestPath = Join-Path $baseDir 'manifest.json'
  if (Test-NonEmptyFile $failures 'aioncore-manifest' '' $bundleManifestPath $false $baseDir) {
    $bundleManifest = Read-JsonFile $bundleManifestPath
    if (-not $bundleManifest) {
      $failures.Add((New-Failure 'publish_or_install_missing' 'aioncore-manifest' '' $bundleManifestPath 'invalid_json')) | Out-Null
    } else {
      if ($bundleManifest.platform -ne $expectedPlatform) {
        $failures.Add((New-Failure 'publish_or_install_missing' 'aioncore-manifest' '' $bundleManifestPath "platform_mismatch:$($bundleManifest.platform)")) | Out-Null
      }
      if ($bundleManifest.arch -ne $expectedArch) {
        $failures.Add((New-Failure 'publish_or_install_missing' 'aioncore-manifest' '' $bundleManifestPath "arch_mismatch:$($bundleManifest.arch)")) | Out-Null
      }
    }
  }

  $managedRoot = Join-Path $baseDir 'managed-resources'
  if (Test-Directory $failures 'managed-resources' '' $managedRoot) {
    if (-not (Test-PathContainedWithin $baseDir $managedRoot)) {
      $failures.Add((New-Failure 'publish_or_install_missing' 'managed-resources' '' $managedRoot 'escaped_path')) | Out-Null
    } else {
      Test-ManagedResourcesContract $failures $baseDir $managedRoot
    }
  }

  return $failures
}

for ($attempt = 1; $attempt -le 5; $attempt++) {
  $failures = @(Test-BundledResourcesOnce)
  if ($failures.Count -eq 0) {
    Write-VerifyLog "verify-bundled-aioncore result=ok runtime=$RuntimeKey attempts=$attempt"
    exit 0
  }

  $summary = ($failures | ConvertTo-Json -Compress -Depth 5)
  if ($attempt -lt 5) {
    Write-VerifyLog "verify-bundled-aioncore result=retry classification=resource_pending_landing runtime=$RuntimeKey attempt=$attempt failures=$summary"
    Start-Sleep -Milliseconds 500
  } else {
    Write-VerifyLog "verify-bundled-aioncore result=fail runtime=$RuntimeKey failures=$summary"
  }
}

exit 1
