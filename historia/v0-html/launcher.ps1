Add-Type -AssemblyName System.Windows.Forms
$htmlPath    = Join-Path $PSScriptRoot "ADMIN ALQUILERES.html"
$xlsmLocal   = Join-Path $PSScriptRoot "planilla.xlsm"
$xlsmNetwork = "\\SERVIDOR\Compartida\Alquileres\planilla.xlsm"
$xlsmPath    = if (Test-Path $xlsmLocal) { $xlsmLocal } else { $xlsmNetwork }
Write-Host "Usando archivo: $xlsmPath"
$port     = 7890

# Apagar instancia anterior si existe
try { Invoke-WebRequest "http://localhost:$port/shutdown" -TimeoutSec 2 -UseBasicParsing | Out-Null } catch {}
Start-Sleep -Milliseconds 600

# Limpiar instancias Excel ocultas huerfanas (sin ventana) que pudo dejar una ejecucion anterior
$hiddenExcel = Get-Process excel -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq 0 }
foreach ($p in $hiddenExcel) {
    Write-Host "Cerrando Excel oculto huerfano (PID $($p.Id))..."
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
if ($hiddenExcel) { Start-Sleep -Milliseconds 800 }

# Eliminar lock file obsoleto si existe (lo deja un Excel que no se cerro bien)
$lockFileName = '~$' + [IO.Path]::GetFileName($xlsmPath)
$lockFilePath = Join-Path ([IO.Path]::GetDirectoryName($xlsmPath)) $lockFileName
if (Test-Path $lockFilePath) {
    Remove-Item $lockFilePath -Force -ErrorAction SilentlyContinue
    Write-Host "Lock file obsoleto eliminado: $lockFilePath"
}

# Iniciar servidor HTTP local
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    $pids = netstat -ano 2>$null | Select-String ":$port\s" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique
    $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 800
    try {
        $listener.Start()
    } catch {
        [Windows.Forms.MessageBox]::Show("No se pudo iniciar el servidor en el puerto $port.`nCerra la ventana anterior y reintenta.", "Admin Alquileres", [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        exit 1
    }
}

# Pre-cargar Excel (FileShare.ReadWrite permite leer aunque Excel lo tenga abierto)
$xlsmBytes = $null
try {
    $stream = [IO.File]::Open($xlsmPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $ms     = New-Object IO.MemoryStream
    $stream.CopyTo($ms)
    $stream.Close()
    $xlsmBytes = $ms.ToArray()
    Write-Host "Excel cargado: $($xlsmBytes.Length) bytes"
} catch {
    Write-Host "ERROR al leer Excel: $($_.Exception.Message)"
}

Start-Process "http://localhost:$port"
Write-Host "Servidor en http://localhost:$port"

# ── Helpers de escritura COM (definidos a nivel de script para garantizar scope) ──
function Set-StrCell($sheet, $row, $col, $val) {
    $s = [string]$val
    if ($s -ne '') { $sheet.Cells($row, $col).Value2 = $s }
}
function Set-NumCell($sheet, $row, $col, $val) {
    if ($null -ne $val -and [string]$val -ne '') {
        $sheet.Cells($row, $col).Value2 = [double]$val
    }
}
function Set-StrCellOrClear($sheet, $row, $col, $val) {
    $s = [string]$val
    if ($s -eq '') { $sheet.Cells($row, $col).ClearContents() }
    else { $sheet.Cells($row, $col).Value2 = $s }
}

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $res.Headers.Add('Access-Control-Allow-Origin', '*')

        switch ($req.Url.LocalPath) {

            '/excel' {
                if ($xlsmBytes) {
                    $res.ContentType     = 'application/octet-stream'
                    $res.ContentLength64 = $xlsmBytes.Length
                    $res.OutputStream.Write($xlsmBytes, 0, $xlsmBytes.Length)
                } else {
                    $res.StatusCode = 503
                }
            }

            '/save' {
                # El browser envia [{r,c,v},...] — PowerShell escribe via Excel COM
                if ($req.HttpMethod -eq 'POST') {
                    try {
                        $bodyMs = New-Object IO.MemoryStream
                        $req.InputStream.CopyTo($bodyMs)
                        $json = [Text.Encoding]::UTF8.GetString($bodyMs.ToArray())
                        $bodyMs.Close()

                        $changes = $json | ConvertFrom-Json
                        if ($changes -isnot [Array]) { $changes = @($changes) }
                        Write-Host "Cambios recibidos: $($changes.Count) celda(s)"

                        # Intentar conectar a Excel ya abierto en esta PC
                        $excelApp  = $null
                        $wb        = $null
                        $weCreated = $false

                        try {
                            $excelApp = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
                            Write-Host "Excel activo encontrado"
                            $wbName = [IO.Path]::GetFileName($xlsmPath)
                            foreach ($w in $excelApp.Workbooks) {
                                if ($w.FullName -eq $xlsmPath -or $w.Name -eq $wbName) {
                                    $wb = $w
                                    Write-Host "Workbook encontrado: $($w.FullName)"
                                    break
                                }
                            }
                        } catch {
                            $excelApp = $null
                        }

                        # Si no habia Excel abierto o no tenia el archivo, abrir oculto
                        if ((-not $excelApp) -or (-not $wb)) {
                            Write-Host "Abriendo Excel oculto..."
                            $excelApp2               = New-Object -ComObject Excel.Application
                            $excelApp2.Visible       = $false
                            $excelApp2.DisplayAlerts = $false
                            $wb        = $excelApp2.Workbooks.Open($xlsmPath, 0, $false)
                            $excelApp  = $excelApp2
                            $weCreated = $true
                            Write-Host "Workbook abierto, ReadOnly=$($wb.ReadOnly)"
                        }

                        if ($wb.ReadOnly) {
                            # Intentar forzar acceso de escritura (resuelve locks obsoletos)
                            try { $wb.ChangeFileAccess(3) } catch {}
                        }
                        if ($wb.ReadOnly) {
                            if ($weCreated) {
                                try { $wb.Close($false) } catch {}
                                try { $excelApp.Quit()  } catch {}
                            }
                            $lf = Join-Path ([IO.Path]::GetDirectoryName($xlsmPath)) ('~$' + [IO.Path]::GetFileName($xlsmPath))
                            $lfMsg = if (Test-Path $lf) { " Existe un lock file (~`$planilla.xlsm) - el archivo puede estar abierto en otra PC o aplicacion." } else { "" }
                            throw "Archivo en modo solo-lectura.$lfMsg Cerrar el Excel en todas las PCs y reintentar el launcher."
                        }

                        # Buscar hoja ALQUILADOS (o la primera hoja)
                        $ws = $null
                        try { $ws = $wb.Sheets("ALQUILADOS") } catch {}
                        if (-not $ws) { $ws = $wb.Sheets(1) }
                        Write-Host "Hoja: $($ws.Name)"

                        # Aplicar cambios (indices SheetJS 0-based -> Excel 1-based)
                        $written = 0
                        foreach ($ch in $changes) {
                            $row  = [int]$ch.r + 1
                            $col  = [int]$ch.c + 1
                            $cell = $ws.Cells($row, $col)
                            if ($null -eq $ch.v -or [string]$ch.v -eq '') {
                                $cell.ClearContents()
                            } elseif ($ch.v -is [string]) {
                                $cell.Value2 = [string]$ch.v
                            } else {
                                # Numerico: cast explicito a double para evitar errores COM
                                $cell.Value2 = [double]$ch.v
                            }
                            Write-Host "  [$row,$col] = $($ch.v)"
                            $written++
                        }

                        $wb.Save()
                        Write-Host "Guardado OK: $written celda(s)"

                        if ($weCreated) {
                            try { $wb.Close($false) } catch {}
                            try { $excelApp.Quit()  } catch {}
                            try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excelApp) | Out-Null } catch {}
                        }

                        # Refrescar copia en memoria para proximas lecturas de /excel
                        try {
                            $st2 = [IO.File]::Open($xlsmPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                            $ms2 = New-Object IO.MemoryStream
                            $st2.CopyTo($ms2)
                            $st2.Close()
                            $xlsmBytes = $ms2.ToArray()
                        } catch {}

                        $res.StatusCode = 200
                        $okMsg = "OK:$written"
                        $b = [Text.Encoding]::UTF8.GetBytes($okMsg)
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)

                    } catch {
                        $errMsg = $_.Exception.Message
                        Write-Host "ERROR al guardar: $errMsg"
                        $res.StatusCode = 500
                        $b = [Text.Encoding]::UTF8.GetBytes($errMsg)
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)
                    }
                } else {
                    $res.StatusCode = 405
                }
            }

            '/add-row' {
                # Agrega una fila nueva al final de los datos en la hoja ALQUILADOS
                if ($req.HttpMethod -eq 'POST') {
                    try {
                        $bodyMs = New-Object IO.MemoryStream
                        $req.InputStream.CopyTo($bodyMs)
                        $json = [Text.Encoding]::UTF8.GetString($bodyMs.ToArray())
                        $bodyMs.Close()
                        $data = $json | ConvertFrom-Json

                        # Abrir Excel (mismo flujo que /save)
                        $excelApp  = $null
                        $wb        = $null
                        $weCreated = $false

                        try {
                            $excelApp = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
                            $wbName   = [IO.Path]::GetFileName($xlsmPath)
                            foreach ($w in $excelApp.Workbooks) {
                                if ($w.FullName -eq $xlsmPath -or $w.Name -eq $wbName) {
                                    $wb = $w; break
                                }
                            }
                        } catch {
                            $excelApp = $null
                        }

                        if ((-not $excelApp) -or (-not $wb)) {
                            $excelApp2               = New-Object -ComObject Excel.Application
                            $excelApp2.Visible       = $false
                            $excelApp2.DisplayAlerts = $false
                            $wb        = $excelApp2.Workbooks.Open($xlsmPath, 0, $false)
                            $excelApp  = $excelApp2
                            $weCreated = $true
                        }

                        if ($wb.ReadOnly) {
                            try { $wb.ChangeFileAccess(3) } catch {}
                        }
                        if ($wb.ReadOnly) {
                            if ($weCreated) { try { $wb.Close($false) } catch {}; try { $excelApp.Quit() } catch {} }
                            $lf = Join-Path ([IO.Path]::GetDirectoryName($xlsmPath)) ('~$' + [IO.Path]::GetFileName($xlsmPath))
                            $lfMsg = if (Test-Path $lf) { " Existe un lock file - el archivo puede estar abierto en otra PC." } else { "" }
                            throw "Archivo en modo solo-lectura.$lfMsg Cerrar el Excel en todas las PCs y reintentar el launcher."
                        }

                        $ws = $null
                        try { $ws = $wb.Sheets("ALQUILADOS") } catch {}
                        if (-not $ws) { $ws = $wb.Sheets(1) }

                        # Ultima fila con dato en columna B (xlUp = -4162)
                        $lastRow = $ws.Cells($ws.Rows.Count, 2).End(-4162).Row
                        Write-Host "Ultima fila de datos: $lastRow"

                        # ── Cabeceras de año/mes ──────────────────────────────
                        # Nombres de meses (indice 1-12)
                        $meses  = @('','ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                                    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE')
                        # Conjunto de nombres validos para deteccion (incluye variantes)
                        $mesSet = @('ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                                    'JULIO','AGOSTO','SETIEMBRE','SEPTIEMBRE',
                                    'OCTUBRE','NOVIEMBRE','DICIEMBRE')

                        $newYear  = 0
                        $newMonth = ''
                        $dtFecha  = $null

                        if ([string]$data.fechaInicio -ne '') {
                            $fmt      = [System.Globalization.CultureInfo]::InvariantCulture
                            $dtFecha  = [DateTime]::ParseExact([string]$data.fechaInicio, "yyyy-MM-dd", $fmt)
                            $newYear  = $dtFecha.Year
                            $newMonth = $meses[$dtFecha.Month]

                            # Buscar hacia atras el ultimo mes y año registrados en la hoja
                            $lastMes  = ''
                            $lastAnio = 0
                            for ($ri = $lastRow; $ri -ge 1 -and ($lastMes -eq '' -or $lastAnio -eq 0); $ri--) {
                                $ca = $ws.Cells($ri, 1).Value2
                                $cb = $ws.Cells($ri, 2).Value2
                                if ($lastMes -eq '') {
                                    $cbN = [string]$cb
                                    if ($mesSet -contains $cbN.Trim().ToUpper()) {
                                        $lastMes = $cbN.Trim().ToUpper()
                                    }
                                }
                                if ($lastAnio -eq 0 -and $null -ne $ca) {
                                    $tryYr = 0
                                    if ([int]::TryParse([string]$ca, [ref]$tryYr) -and $tryYr -ge 2020 -and $tryYr -le 2035) {
                                        $lastAnio = $tryYr
                                    }
                                }
                            }

                            # Normalizar septiembre (dos grafias posibles)
                            $lastMesN = if ($lastMes -eq 'SETIEMBRE') { 'SEPTIEMBRE' } else { $lastMes }
                            $newMesN  = if ($newMonth -eq 'SETIEMBRE') { 'SEPTIEMBRE' } else { $newMonth }
                            Write-Host "Ultimo mes en hoja: $lastMes ($lastAnio) | Nuevo: $newMonth ($newYear)"

                            if ($lastMesN -ne $newMesN -or $lastAnio -ne $newYear) {
                                # Es el primero de este mes/año -> insertar dos filas de cabecera
                                $hRow = $lastRow + 1

                                # Fila de AÑO: color #548135 = BGR decimal 3506516
                                $ws.Range($ws.Cells($hRow, 1), $ws.Cells($hRow, 14)).Interior.Color = 3506516
                                $ws.Cells($hRow, 1).Value2  = [double]$newYear
                                $ws.Cells($hRow, 1).Font.Bold = $true

                                $hRow++

                                # Fila de MES: color #A8D08D = BGR decimal 9293992
                                $ws.Range($ws.Cells($hRow, 1), $ws.Cells($hRow, 14)).Interior.Color = 9293992
                                Set-StrCell $ws $hRow 2 $newMonth
                                $ws.Cells($hRow, 2).Font.Bold = $true

                                $lastRow = $hRow   # el alquiler va despues de las cabeceras
                                Write-Host "Cabeceras insertadas: $newYear / $newMonth"
                            }
                        }

                        $r = $lastRow + 1
                        Write-Host "Insertando alquiler en fila $r"

                        # Columnas Excel 1-based:
                        # B=2 dir  C=3 prop  D=4 telProp  E=5 mailProp
                        # F=6 importeBase  H=8 importeActual
                        # I=9 contrato  J=10 fechaInicio
                        # K=11 inquilino  L=12 telInq  M=13 mailInq  N=14 notas
                        Set-StrCell $ws $r  2 $data.direccion
                        Set-StrCell $ws $r  3 $data.propietario
                        Set-StrCell $ws $r  4 $data.telProp
                        Set-StrCell $ws $r  5 $data.mailProp
                        Set-NumCell $ws $r  6 $data.importeBase
                        Set-NumCell $ws $r  8 $data.importeBase
                        Set-StrCell $ws $r  9 $data.contratoStr
                        if ($null -ne $dtFecha) {
                            Set-NumCell $ws $r 10 $dtFecha.ToOADate()
                        }
                        Set-StrCell $ws $r 11 $data.inquilino
                        Set-StrCell $ws $r 12 $data.telInq
                        Set-StrCell $ws $r 13 $data.mailInq
                        Set-StrCell $ws $r 14 $data.notas

                        $wb.Save()
                        Write-Host "Fila $r guardada: $($data.direccion)"

                        if ($weCreated) {
                            try { $wb.Close($false) } catch {}
                            try { $excelApp.Quit()  } catch {}
                            try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excelApp) | Out-Null } catch {}
                        }

                        # Refrescar bytes en memoria
                        try {
                            $st2 = [IO.File]::Open($xlsmPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                            $ms2 = New-Object IO.MemoryStream
                            $st2.CopyTo($ms2); $st2.Close()
                            $xlsmBytes = $ms2.ToArray()
                        } catch {}

                        $res.StatusCode = 200
                        $b = [Text.Encoding]::UTF8.GetBytes("OK:$r")
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)

                    } catch {
                        $errMsg = $_.Exception.Message
                        $inner  = if ($_.Exception.InnerException) { " | Inner: $($_.Exception.InnerException.Message)" } else { "" }
                        $at     = if ($_.InvocationInfo) { " | Linea: $($_.InvocationInfo.ScriptLineNumber)" } else { "" }
                        $full   = "$errMsg$inner$at"
                        Write-Host "ERROR add-row: $full"
                        $res.StatusCode = 500
                        $b = [Text.Encoding]::UTF8.GetBytes($full)
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)
                    }
                } else {
                    $res.StatusCode = 405
                }
            }

            '/delete-row' {
                # Pinta la fila de gris y escribe INACTIVO en la columna ESTADO
                if ($req.HttpMethod -eq 'POST') {
                    try {
                        $bodyMs = New-Object IO.MemoryStream
                        $req.InputStream.CopyTo($bodyMs)
                        $json = [Text.Encoding]::UTF8.GetString($bodyMs.ToArray())
                        $bodyMs.Close()
                        $data   = $json | ConvertFrom-Json
                        $rowNum = [int]$data.row + 1   # SheetJS 0-based -> Excel 1-based

                        # Abrir Excel COM
                        $excelApp  = $null
                        $wb        = $null
                        $weCreated = $false
                        try {
                            $excelApp = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
                            $wbName   = [IO.Path]::GetFileName($xlsmPath)
                            foreach ($w in $excelApp.Workbooks) {
                                if ($w.FullName -eq $xlsmPath -or $w.Name -eq $wbName) { $wb = $w; break }
                            }
                        } catch { $excelApp = $null }

                        if ((-not $excelApp) -or (-not $wb)) {
                            $excelApp2               = New-Object -ComObject Excel.Application
                            $excelApp2.Visible       = $false
                            $excelApp2.DisplayAlerts = $false
                            $wb        = $excelApp2.Workbooks.Open($xlsmPath, 0, $false)
                            $excelApp  = $excelApp2
                            $weCreated = $true
                        }
                        if ($wb.ReadOnly) {
                            try { $wb.ChangeFileAccess(3) } catch {}
                        }
                        if ($wb.ReadOnly) {
                            if ($weCreated) { try { $wb.Close($false) } catch {}; try { $excelApp.Quit() } catch {} }
                            $lf = Join-Path ([IO.Path]::GetDirectoryName($xlsmPath)) ('~$' + [IO.Path]::GetFileName($xlsmPath))
                            $lfMsg = if (Test-Path $lf) { " Existe un lock file - el archivo puede estar abierto en otra PC." } else { "" }
                            throw "Archivo en modo solo-lectura.$lfMsg Cerrar el Excel en todas las PCs y reintentar el launcher."
                        }

                        $ws = $null
                        try { $ws = $wb.Sheets("ALQUILADOS") } catch {}
                        if (-not $ws) { $ws = $wb.Sheets(1) }

                        # Pintar A:N (col 1 a 14) de gris #D0D0D0 = 13684944
                        $ws.Range($ws.Cells($rowNum, 1), $ws.Cells($rowNum, 14)).Interior.Color = 13684944

                        # Buscar columna ESTADO en fila 1 y escribir INACTIVO
                        $usedCols  = $ws.UsedRange.Column + $ws.UsedRange.Columns.Count - 1
                        $estadoCol = -1
                        for ($c = 1; $c -le $usedCols; $c++) {
                            $hdr = $ws.Cells(1, $c).Value2
                            if ([string]$hdr -eq "ESTADO") { $estadoCol = $c; break }
                        }
                        if ($estadoCol -gt 0) {
                            $ws.Cells($rowNum, $estadoCol).Value2 = "INACTIVO"
                        }

                        $wb.Save()
                        Write-Host "Fila $rowNum eliminada (gris + INACTIVO)"

                        if ($weCreated) {
                            try { $wb.Close($false) } catch {}
                            try { $excelApp.Quit()  } catch {}
                            try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excelApp) | Out-Null } catch {}
                        }
                        try {
                            $st2 = [IO.File]::Open($xlsmPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                            $ms2 = New-Object IO.MemoryStream
                            $st2.CopyTo($ms2); $st2.Close()
                            $xlsmBytes = $ms2.ToArray()
                        } catch {}

                        $res.StatusCode = 200
                        $b = [Text.Encoding]::UTF8.GetBytes("OK")
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)

                    } catch {
                        $errMsg = $_.Exception.Message
                        Write-Host "ERROR delete-row: $errMsg"
                        $res.StatusCode = 500
                        $b = [Text.Encoding]::UTF8.GetBytes($errMsg)
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)
                    }
                } else {
                    $res.StatusCode = 405
                }
            }

            '/edit-row' {
                # Edita los campos de una fila existente en la hoja ALQUILADOS
                # Body: { row, direccion, propietario, telProp, mailProp, importeBase, contratoStr, fechaInicio, inquilino, telInq, mailInq, notas }
                if ($req.HttpMethod -eq 'POST') {
                    try {
                        $bodyMs = New-Object IO.MemoryStream
                        $req.InputStream.CopyTo($bodyMs)
                        $json = [Text.Encoding]::UTF8.GetString($bodyMs.ToArray())
                        $bodyMs.Close()
                        $data = $json | ConvertFrom-Json

                        $r = [int]$data.row + 1   # SheetJS 0-based -> Excel 1-based

                        # Abrir Excel COM
                        $excelApp  = $null
                        $wb        = $null
                        $weCreated = $false
                        try {
                            $excelApp = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
                            $wbName   = [IO.Path]::GetFileName($xlsmPath)
                            foreach ($w in $excelApp.Workbooks) {
                                if ($w.FullName -eq $xlsmPath -or $w.Name -eq $wbName) { $wb = $w; break }
                            }
                        } catch { $excelApp = $null }

                        if ((-not $excelApp) -or (-not $wb)) {
                            $excelApp2               = New-Object -ComObject Excel.Application
                            $excelApp2.Visible       = $false
                            $excelApp2.DisplayAlerts = $false
                            $wb        = $excelApp2.Workbooks.Open($xlsmPath, 0, $false)
                            $excelApp  = $excelApp2
                            $weCreated = $true
                        }
                        if ($wb.ReadOnly) { try { $wb.ChangeFileAccess(3) } catch {} }
                        if ($wb.ReadOnly) {
                            if ($weCreated) { try { $wb.Close($false) } catch {}; try { $excelApp.Quit() } catch {} }
                            $lf = Join-Path ([IO.Path]::GetDirectoryName($xlsmPath)) ('~$' + [IO.Path]::GetFileName($xlsmPath))
                            $lfMsg = if (Test-Path $lf) { " Existe un lock file." } else { "" }
                            throw "Archivo en modo solo-lectura.$lfMsg"
                        }

                        $ws = $null
                        try { $ws = $wb.Sheets("ALQUILADOS") } catch {}
                        if (-not $ws) { $ws = $wb.Sheets(1) }

                        # Columnas: B=2 dir C=3 prop D=4 telProp E=5 mailProp
                        #           F=6 importeBase H=8 importeActual
                        #           I=9 contrato J=10 fechaInicio
                        #           K=11 inquilino L=12 telInq M=13 mailInq N=14 notas
                        Set-StrCellOrClear $ws $r  2 $data.direccion
                        Set-StrCellOrClear $ws $r  3 $data.propietario
                        Set-StrCellOrClear $ws $r  4 $data.telProp
                        Set-StrCellOrClear $ws $r  5 $data.mailProp
                        if ([string]$data.importeBase -ne '') {
                            Set-NumCell $ws $r  6 $data.importeBase
                            Set-NumCell $ws $r  8 $data.importeBase
                        }
                        Set-StrCellOrClear $ws $r  9 $data.contratoStr
                        if ([string]$data.fechaInicio -ne '') {
                            $fmt     = [System.Globalization.CultureInfo]::InvariantCulture
                            $dtFecha = [DateTime]::ParseExact([string]$data.fechaInicio, "yyyy-MM-dd", $fmt)
                            Set-NumCell $ws $r 10 $dtFecha.ToOADate()
                        }
                        Set-StrCellOrClear $ws $r 11 $data.inquilino
                        Set-StrCellOrClear $ws $r 12 $data.telInq
                        Set-StrCellOrClear $ws $r 13 $data.mailInq
                        Set-StrCellOrClear $ws $r 14 $data.notas

                        $wb.Save()
                        Write-Host "Fila $r editada: $($data.direccion)"

                        if ($weCreated) {
                            try { $wb.Close($false) } catch {}
                            try { $excelApp.Quit()  } catch {}
                            try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excelApp) | Out-Null } catch {}
                        }
                        try {
                            $st2 = [IO.File]::Open($xlsmPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                            $ms2 = New-Object IO.MemoryStream
                            $st2.CopyTo($ms2); $st2.Close()
                            $xlsmBytes = $ms2.ToArray()
                        } catch {}

                        $res.StatusCode = 200
                        $b = [Text.Encoding]::UTF8.GetBytes("OK")
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)

                    } catch {
                        $errMsg = $_.Exception.Message
                        $inner  = if ($_.Exception.InnerException) { " | Inner: $($_.Exception.InnerException.Message)" } else { "" }
                        $full   = "$errMsg$inner"
                        Write-Host "ERROR edit-row: $full"
                        $res.StatusCode = 500
                        $b = [Text.Encoding]::UTF8.GetBytes($full)
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)
                    }
                } else {
                    $res.StatusCode = 405
                }
            }

            '/admin-save' {
                # Agrega, edita o elimina una administracion en la hoja ADMINISTRACIONES
                # Body: { action: 'add'|'update'|'delete', row, nombre, edificios, telefono, mail }
                if ($req.HttpMethod -eq 'POST') {
                    try {
                        $bodyMs = New-Object IO.MemoryStream
                        $req.InputStream.CopyTo($bodyMs)
                        $json = [Text.Encoding]::UTF8.GetString($bodyMs.ToArray())
                        $bodyMs.Close()
                        $data = $json | ConvertFrom-Json

                        # Abrir Excel (mismo flujo que /save)
                        $excelApp  = $null
                        $wb        = $null
                        $weCreated = $false
                        try {
                            $excelApp = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application")
                            $wbName   = [IO.Path]::GetFileName($xlsmPath)
                            foreach ($w in $excelApp.Workbooks) {
                                if ($w.FullName -eq $xlsmPath -or $w.Name -eq $wbName) { $wb = $w; break }
                            }
                        } catch { $excelApp = $null }

                        if ((-not $excelApp) -or (-not $wb)) {
                            $excelApp2               = New-Object -ComObject Excel.Application
                            $excelApp2.Visible       = $false
                            $excelApp2.DisplayAlerts = $false
                            $wb        = $excelApp2.Workbooks.Open($xlsmPath, 0, $false)
                            $excelApp  = $excelApp2
                            $weCreated = $true
                        }
                        if ($wb.ReadOnly) {
                            try { $wb.ChangeFileAccess(3) } catch {}
                        }
                        if ($wb.ReadOnly) {
                            if ($weCreated) { try { $wb.Close($false) } catch {}; try { $excelApp.Quit() } catch {} }
                            $lf = Join-Path ([IO.Path]::GetDirectoryName($xlsmPath)) ('~$' + [IO.Path]::GetFileName($xlsmPath))
                            $lfMsg = if (Test-Path $lf) { " Existe un lock file - el archivo puede estar abierto en otra PC." } else { "" }
                            throw "Archivo en modo solo-lectura.$lfMsg Cerrar el Excel en todas las PCs y reintentar el launcher."
                        }

                        $ws = $null
                        try { $ws = $wb.Sheets("ADMINISTRACIONES") } catch {}
                        if (-not $ws) { $ws = $wb.Sheets(2) }

                        $action = [string]$data.action

                        if ($action -eq 'delete') {
                            $r = [int]$data.row + 1
                            $ws.Range($ws.Cells($r,1), $ws.Cells($r,4)).ClearContents()
                            Write-Host "Administracion fila $r eliminada"
                        } else {
                            if ($action -eq 'update') {
                                $r = [int]$data.row + 1
                            } else {
                                $lastRow = $ws.Cells($ws.Rows.Count, 1).End(-4162).Row
                                if ($lastRow -lt 2) { $lastRow = 2 }
                                $r = $lastRow + 1
                            }
                            Set-StrCellOrClear $ws $r 1 $data.nombre
                            Set-StrCellOrClear $ws $r 2 $data.edificios
                            Set-StrCellOrClear $ws $r 3 $data.telefono
                            Set-StrCellOrClear $ws $r 4 $data.mail
                            Write-Host "Administracion fila $r guardada: $($data.nombre)"
                        }

                        $wb.Save()

                        if ($weCreated) {
                            try { $wb.Close($false) } catch {}
                            try { $excelApp.Quit()  } catch {}
                            try { [Runtime.InteropServices.Marshal]::ReleaseComObject($excelApp) | Out-Null } catch {}
                        }

                        try {
                            $st2 = [IO.File]::Open($xlsmPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                            $ms2 = New-Object IO.MemoryStream
                            $st2.CopyTo($ms2); $st2.Close()
                            $xlsmBytes = $ms2.ToArray()
                        } catch {}

                        $res.StatusCode = 200
                        $b = [Text.Encoding]::UTF8.GetBytes("OK")
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)

                    } catch {
                        $errMsg = $_.Exception.Message
                        $inner  = if ($_.Exception.InnerException) { " | Inner: $($_.Exception.InnerException.Message)" } else { "" }
                        $full   = "$errMsg$inner"
                        Write-Host "ERROR admin-save: $full"
                        $res.StatusCode = 500
                        $b = [Text.Encoding]::UTF8.GetBytes($full)
                        $res.ContentLength64 = $b.Length
                        $res.OutputStream.Write($b, 0, $b.Length)
                    }
                } else {
                    $res.StatusCode = 405
                }
            }

            '/ipc-fetch' {
                # Descarga la pagina del INE y extrae el IPC de los ultimos 12 meses
                $res.ContentType = "application/json; charset=utf-8"
                $jsonBody = $null
                try {
                    $mes    = $req.QueryString["mes"]
                    $anio   = $req.QueryString["anio"]
                    $ipcUrl = "https://www.gub.uy/instituto-nacional-estadistica/comunicacion/publicaciones/indice-precios-del-consumo-ipc-$mes-$anio"
                    $wr     = Invoke-WebRequest -Uri $ipcUrl -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
                    $html   = $wr.Content
                    $val    = $null
                    # Patrones amplios: busca porcentaje cerca de "12 meses"
                    if ($html -match '12\s*meses[^%]{0,120}?([\d]+[,.][\d]{1,2})\s*%') {
                        $val = $Matches[1]
                    } elseif ($html -match '([\d]+[,.][\d]{1,2})\s*%[^<]{0,120}?12\s*meses') {
                        $val = $Matches[1]
                    } elseif ($html -match '"ipc"[^:]*:[^"]*"([\d]+[,.][\d]+)"') {
                        $val = $Matches[1]
                    }
                    if ($val) {
                        $res.StatusCode = 200
                        $jsonBody = "{`"ipc`":`"$val`"}"
                    } else {
                        # Devuelve fragmento del HTML para debug
                        $idx = $html.IndexOf('12 meses')
                        $snip = if ($idx -ge 0) { $html.Substring([Math]::Max(0,$idx-50), [Math]::Min(200,$html.Length-[Math]::Max(0,$idx-50))) } else { "no contiene '12 meses'" }
                        $snip = $snip -replace '["\r\n]',' '
                        $res.StatusCode = 404
                        $jsonBody = "{`"error`":`"no encontrado`",`"debug`":`"$snip`"}"
                    }
                } catch {
                    $res.StatusCode = 502
                    $safeMsg = $_.Exception.Message -replace '["\r\n]',"'"
                    $jsonBody = "{`"error`":`"$safeMsg`"}"
                }
                $b = [Text.Encoding]::UTF8.GetBytes($jsonBody)
                $res.ContentLength64 = $b.Length
                $res.OutputStream.Write($b, 0, $b.Length)
            }

            '/shutdown' {
                $res.StatusCode = 200
                $res.Close()
                $listener.Stop()
                return
            }

            default {
                $reqPath = $req.Url.LocalPath
                if ($reqPath -eq '/' -or $reqPath -eq '') {
                    $filePath    = $htmlPath
                    $contentType = 'text/html; charset=utf-8'
                } else {
                    $fileName2   = [IO.Path]::GetFileName($reqPath)
                    $filePath    = Join-Path $PSScriptRoot $fileName2
                    $ext         = [IO.Path]::GetExtension($fileName2).ToLower()
                    $contentType = switch ($ext) {
                        '.css'  { 'text/css; charset=utf-8' }
                        '.js'   { 'application/javascript; charset=utf-8' }
                        '.html' { 'text/html; charset=utf-8' }
                        default { 'application/octet-stream' }
                    }
                }
                if (Test-Path $filePath) {
                    $bytes = [IO.File]::ReadAllBytes($filePath)
                    $res.ContentType     = $contentType
                    $res.ContentLength64 = $bytes.Length
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $res.StatusCode = 404
                }
            }
        }

        $res.Close()
    } catch { }
}
