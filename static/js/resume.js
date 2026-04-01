document.addEventListener('DOMContentLoaded', async function() {
    const user = userManager.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.textContent = `欢迎，${user.username}`;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const resumeId = Number(urlParams.get('id'));
    if (!resumeId) {
        document.getElementById('content').innerHTML = '<div class="error-message">简历 ID 不存在。</div>';
        return;
    }

    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('errorMessage');
    const resumeInfo = document.getElementById('resumeInfo');
    const analysisDiv = document.getElementById('analysisResult');
    const questionsDiv = document.getElementById('questionsList');
    const generatingDiv = document.getElementById('generating');
    const optimizationMessage = document.getElementById('optimizationMessage');
    const optimizationVersions = document.getElementById('optimizationVersions');
    const exportRecords = document.getElementById('exportRecords');
    const versionTypeSelect = document.getElementById('versionTypeSelect');
    const sessionSelect = document.getElementById('sessionSelect');
    const jobMatchSelect = document.getElementById('jobMatchSelect');

    const analyzeBtn = document.getElementById('analyzeBtn');
    const generateBtn = document.getElementById('generateBtn');
    const numQuestionsInput = document.getElementById('numQuestions');
    const generateOptimizationBtn = document.getElementById('generateOptimizationBtn');

    let resume = null;
    let sessions = [];
    let sessionDetailsCache = new Map();
    let analysis = '';
    let questions = [];
    let versions = [];
    let records = [];

    // 辅助函数
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function translateStatus(status) {
        if (status === 'confirmed') return '已确认';
        if (status === 'completed') return '待确认';
        return '进行中';
    }

    // 增强渲染：简历信息
    function renderResumeInfo() {
        if (!resume) return;
        const fileDate = new Date(resume.created_at).toLocaleString('zh-CN');
        const contentPreview = resume.content_text ? resume.content_text.substring(0, 800) : '暂无解析内容';
        resumeInfo.innerHTML = `
            <div class="info-row">
                <span class="info-label">📁 文件名</span>
                <span class="info-value">${escapeHtml(resume.filename)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">⏱️ 上传时间</span>
                <span class="info-value">${fileDate}</span>
            </div>
            <div class="info-row">
                <span class="info-label">📝 原始内容摘要</span>
                <div class="resume-preview-full">${escapeHtml(contentPreview)}${resume.content_text && resume.content_text.length > 800 ? '……' : ''}</div>
            </div>
        `;
        const badgeSpan = document.getElementById('fileFormatBadge');
        if(badgeSpan && resume.filename) {
            const ext = resume.filename.split('.').pop().toUpperCase();
            badgeSpan.textContent = ext === 'PDF' ? '📄 PDF 文档' : (ext === 'DOCX' ? '📝 DOCX 文档' : '📄 简历文件');
        }
    }

    // 智能解析分析文本，去除 Markdown 标记，转换为结构化列表
    function beautifyAnalysisText(rawText) {
        if (!rawText) return '<p class="empty-state">暂无分析结果，点击「开始分析」获取智能报告。</p>';
        
        // 预处理：去除 Markdown 标记
        let cleanedText = rawText
            // 去除标题标记（如 ### 1.  → 1.）
            .replace(/^#+\s*/gm, '')
            // 去除加粗标记 **文本** → 文本
            .replace(/\*\*(.*?)\*\*/g, '$1')
            // 去除斜体标记 *文本* → 文本（但保留作为列表项的 *）
            .replace(/(?<!\*)\*(?!\*)(.*?)\*(?<!\*)/g, '$1')
            // 去除列表项前的 - 或 * 符号，但保留内容（后面会重新处理为列表）
            .replace(/^[\-\*]\s+/gm, '')
            // 去除多余的空行
            .replace(/\n\s*\n/g, '\n');
        
        let lines = cleanedText.split(/\r?\n/).filter(l => l.trim().length > 0);
        let sections = [];
        let currentSection = null;
        const sectionKeywords = ['个人信息总结', '教育背景', '项目经历', '工作经历', '技能评估', '优势与亮点', '改进建议', '整体定位', '教育背景分析', '专业技能'];
        
        for (let line of lines) {
            let trimmed = line.trim();
            let matched = false;
            // 检查是否为章节标题（数字序号 + 标题）
            for (let kw of sectionKeywords) {
                if (trimmed.includes(kw) && (trimmed.length < 30 || trimmed.startsWith(kw) || /^\d+\./.test(trimmed))) {
                    if (currentSection) sections.push(currentSection);
                    currentSection = { title: trimmed, points: [] };
                    matched = true;
                    break;
                }
            }
            if (!matched && currentSection) {
                // 普通内容行，加入当前章节的列表
                currentSection.points.push(trimmed);
            } else if (!matched && !currentSection && trimmed.length > 3) {
                // 无标题时的文本块
                sections.push({ title: null, points: [trimmed] });
            }
        }
        if (currentSection) sections.push(currentSection);
        
        // 如果没有任何结构化段落，直接返回分行文本
        if (sections.length === 0) {
            return `<div class="analysis-block">${escapeHtml(cleanedText).replace(/\n/g, '<br/>')}</div>`;
        }
        
        let html = '';
        for (let sec of sections) {
            if (sec.title) {
                html += `<div class="analysis-block"><h4>${escapeHtml(sec.title)}</h4>`;
                if (sec.points.length) {
                    html += `<ul>`;
                    for (let pt of sec.points) {
                        html += `<li>${escapeHtml(pt)}</li>`;
                    }
                    html += `</ul>`;
                } else {
                    html += `<div class="sub-section">待补充详细描述</div>`;
                }
                html += `</div>`;
            } else if (sec.points.length) {
                html += `<div class="analysis-block"><div style="margin-bottom: 6px;">${sec.points.map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div></div>`;
            }
        }
        
        // 如果生成的 HTML 太短，回退到原始分行
        if (html.length < 50) {
            return `<div class="analysis-block">${escapeHtml(cleanedText).replace(/\n/g, '<br/>')}</div>`;
        }
        return html;
    }

    function renderAnalysis() {
        if (analysis) {
            analysisDiv.innerHTML = beautifyAnalysisText(analysis);
            analyzeBtn.textContent = '🔄 重新分析';
        } else {
            analysisDiv.innerHTML = '<p class="empty-state">✨ 还没有分析结果，点击“开始分析”获取深度结构化报告。</p>';
            analyzeBtn.textContent = '📊 开始分析';
        }
    }

    function renderQuestions() {
        if (!questions.length) {
            questionsDiv.innerHTML = '<p class="empty-state">📌 暂无题目，点击“生成题目”获取模拟面试题库。</p>';
            return;
        }
        let html = '';
        questions.forEach((q, idx) => {
            const category = q.category || '面试问题';
            const questionText = q.question;
            const answerText = q.answer || '暂无参考答案，建议结合简历优化回答。';
            html += `
                <div class="question-item" style="background: #ffffff; border-left: 4px solid #667eea; transition: 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                        <span class="category" style="background: #667eea20; color:#2c3e66;">${escapeHtml(category)}</span>
                        <span class="badge-version">题目 ${idx+1}</span>
                    </div>
                    <h4 style="font-size: 1rem; margin-bottom: 12px;">❓ ${escapeHtml(questionText)}</h4>
                    ${answerText ? `
                        <div class="answer-section">
                            <button class="btn-toggle-answer" type="button" data-answer-toggle="${idx}" style="background:#f1f5f9; color:#2c3e66;">📖 显示参考答案</button>
                            <div class="answer-content hidden" id="answer-${idx}" style="background:#fafcff; border-left: 4px solid #4caf50; margin-top: 14px;">
                                <strong>💡 参考回答思路</strong>
                                <div class="answer-text" style="margin-top: 8px;">${escapeHtml(answerText).replace(/\n/g, '<br/>')}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        questionsDiv.innerHTML = html;
        document.querySelectorAll('[data-answer-toggle]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = btn.dataset.answerToggle;
                const answerBlock = document.getElementById(`answer-${idx}`);
                if (answerBlock) {
                    const hidden = answerBlock.classList.contains('hidden');
                    answerBlock.classList.toggle('hidden', !hidden);
                    btn.textContent = hidden ? '🙈 隐藏答案' : '📖 显示参考答案';
                }
            });
        });
    }

    function renderVersions() {
        if (!versions.length) {
            optimizationVersions.innerHTML = '<p class="empty-state">✨ 还没有优化版本，选择风格与画像后点击生成。</p>';
            return;
        }
        let html = '';
        for (let ver of versions) {
            const highlights = ver.highlights || [];
            html += `
                <div class="resume-item" style="border-radius: 24px;">
                    <h3 style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                        ${escapeHtml(ver.title)}
                        <span class="badge-version">${escapeHtml(ver.version_type)}</span>
                        ${ver.target_job_title ? `<span class="score-pill">🎯 ${escapeHtml(ver.target_job_title)}</span>` : ''}
                    </h3>
                    <p><strong>📅 生成时间：</strong>${new Date(ver.created_at).toLocaleString('zh-CN')}</p>
                    ${ver.summary ? `<p><strong>📌 优化摘要：</strong>${escapeHtml(ver.summary)}</p>` : ''}
                    ${highlights.length ? `<div><strong>✨ 优化亮点</strong><ul style="margin-top: 6px; margin-left: 20px;">${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>` : ''}
                    <div class="summary-box" style="background: #f9fbfe; margin: 14px 0; max-height: 280px; overflow-y: auto;">
                        ${escapeHtml(ver.content).replace(/\n/g, '<br/>')}
                    </div>
                    <div class="resume-actions" style="margin-top: 16px;">
                        <button class="btn btn-success" data-export-version="${ver.id}" data-format="txt">📄 导出 TXT</button>
                        <button class="btn btn-secondary" data-export-version="${ver.id}" data-format="md">📝 导出 MD</button>
                        <button class="btn btn-secondary" data-export-version="${ver.id}" data-format="docx">📑 导出 DOCX</button>
                        <button class="btn btn-secondary" data-export-version="${ver.id}" data-format="pdf">🖨️ 导出 PDF</button>
                        <button class="btn btn-danger" data-delete-version="${ver.id}">🗑️ 删除版本</button>
                    </div>
                </div>
            `;
        }
        optimizationVersions.innerHTML = html;
        // 绑定导出和删除事件
        optimizationVersions.querySelectorAll('[data-export-version]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const versionId = Number(btn.dataset.exportVersion);
                const exportFormat = btn.dataset.format;
                await exportVersion(versionId, exportFormat);
            });
        });
        optimizationVersions.querySelectorAll('[data-delete-version]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const versionId = Number(btn.dataset.deleteVersion);
                if (confirm('确认删除这个优化版本吗？')) {
                    try {
                        await api.deleteResumeOptimization(versionId, user.id);
                        await refreshOptimizationsAndExports();
                    } catch (error) {
                        showOptimizationMessage(error.message, true);
                    }
                }
            });
        });
    }

    function renderExportRecords() {
        const filtered = records.filter((record) => versions.some((version) => version.id === record.optimization_version_id));
        if (!filtered.length) {
            exportRecords.innerHTML = '<p class="empty-state">📭 暂无导出记录，优化简历后可导出备份。</p>';
            return;
        }
        let html = '';
        for (let rec of filtered) {
            html += `
                <div class="resume-item compact-item" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <div>
                        <h3>📎 ${rec.export_format.toUpperCase()} 导出文件</h3>
                        <p><strong>导出时间：</strong>${new Date(rec.created_at).toLocaleString('zh-CN')}</p>
                        <p class="resume-preview">${escapeHtml(rec.file_path.split('/').pop() || '优化版本')}</p>
                    </div>
                    <a class="btn btn-primary" href="${api.getExportDownloadUrl(rec.id, user.id)}" style="white-space: nowrap;">⬇️ 下载文件</a>
                </div>
            `;
        }
        exportRecords.innerHTML = html;
    }

    function showOptimizationMessage(message, isError = false) {
        optimizationMessage.textContent = message;
        optimizationMessage.className = isError ? 'error-message' : 'success-message';
    }

    async function refreshOptimizationsAndExports() {
        const [optimizationResponse, exportResponse] = await Promise.all([
            api.getResumeOptimizations(resumeId, user.id),
            api.getExportRecords(user.id),
        ]);
        versions = optimizationResponse.versions || [];
        records = exportResponse.records || [];
        renderVersions();
        renderExportRecords();
    }

    async function exportVersion(versionId, exportFormat) {
        try {
            await api.exportResumeOptimization(versionId, user.id, exportFormat);
            showOptimizationMessage(`已导出 ${exportFormat.toUpperCase()} 文件`);
            await refreshOptimizationsAndExports();
        } catch (error) {
            showOptimizationMessage(error.message, true);
        }
    }

    async function renderSessionSelect() {
        const options = ['<option value="">不使用问诊画像</option>'];
        sessions.forEach((session) => {
            options.push(
                `<option value="${session.id}">${escapeHtml(session.title)} · ${translateStatus(session.status)}</option>`
            );
        });
        sessionSelect.innerHTML = options.join('');
        const firstConfirmed = sessions.find((session) => session.status === 'confirmed') || sessions[0];
        if (firstConfirmed) {
            sessionSelect.value = String(firstConfirmed.id);
        }
    }

    async function hydrateSelectedSession() {
        const sessionId = Number(sessionSelect.value);
        if (!sessionId) {
            jobMatchSelect.innerHTML = '<option value="">不使用岗位匹配结果</option>';
            return;
        }
        if (!sessionDetailsCache.has(sessionId)) {
            const detail = await api.getInterviewSession(sessionId);
            sessionDetailsCache.set(sessionId, detail);
        }
        const detail = sessionDetailsCache.get(sessionId);
        const matches = detail.job_matches || [];
        const options = ['<option value="">不使用岗位匹配结果</option>'];
        matches.forEach((match) => {
            options.push(
                `<option value="${match.id}">${escapeHtml(match.job_title)} · 匹配分 ${match.match_score}</option>`
            );
        });
        jobMatchSelect.innerHTML = options.join('');
    }

    async function loadAll() {
        try {
            loadingDiv.className = 'loading';
            errorDiv.className = 'hidden';

            const [resumeResponse, sessionResponse, exportResponse] = await Promise.all([
                api.getUserResumes(user.id),
                api.getInterviewSessions(user.id),
                api.getExportRecords(user.id),
            ]);

            resume = (resumeResponse.resumes || []).find((item) => item.id === resumeId);
            if (!resume) throw new Error('简历不存在');

            sessions = sessionResponse.sessions || [];
            records = exportResponse.records || [];

            const [questionResponse, optimizationResponse] = await Promise.all([
                api.getQuestions(resumeId),
                api.getResumeOptimizations(resumeId, user.id),
            ]);

            questions = questionResponse.questions || [];
            versions = optimizationResponse.versions || [];
            analysis = resume.analysis_result || '';

            renderResumeInfo();
            renderAnalysis();
            renderQuestions();
            await renderSessionSelect();
            await hydrateSelectedSession();
            renderVersions();
            renderExportRecords();
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.className = 'error-message';
        } finally {
            loadingDiv.className = 'hidden';
        }
    }

    analyzeBtn.addEventListener('click', async () => {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = '分析中...';
        errorDiv.className = 'hidden';

        try {
            const response = await api.analyzeResume(resumeId);
            analysis = response.analysis;
            renderAnalysis();
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.className = 'error-message';
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = analysis ? '重新分析' : '开始分析';
        }
    });

    generateBtn.addEventListener('click', async () => {
        const numQuestions = parseInt(numQuestionsInput.value, 10) || 10;
        generateBtn.disabled = true;
        generateBtn.textContent = '生成中...';
        generatingDiv.className = 'loading';

        try {
            const response = await api.generateQuestions(resumeId, numQuestions);
            questions = response.questions || [];
            renderQuestions();
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.className = 'error-message';
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '生成题目';
            generatingDiv.className = 'hidden';
        }
    });

    sessionSelect.addEventListener('change', async () => {
        await hydrateSelectedSession();
    });

    generateOptimizationBtn.addEventListener('click', async () => {
        generateOptimizationBtn.disabled = true;
        generateOptimizationBtn.textContent = '生成中...';
        optimizationMessage.className = 'hidden';

        try {
            const payload = {
                user_id: user.id,
                version_type: versionTypeSelect.value,
            };
            if (sessionSelect.value) payload.session_id = Number(sessionSelect.value);
            if (jobMatchSelect.value) payload.job_match_id = Number(jobMatchSelect.value);
            await api.createResumeOptimization(resumeId, payload);
            showOptimizationMessage('优化版本已生成');
            await refreshOptimizationsAndExports();
        } catch (error) {
            showOptimizationMessage(error.message, true);
        } finally {
            generateOptimizationBtn.disabled = false;
            generateOptimizationBtn.textContent = '生成优化版本';
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            userManager.clearUser();
            window.location.href = '/login.html';
        });
    }

    await loadAll();
});