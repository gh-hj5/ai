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
            if (!resume) {
                throw new Error('简历不存在');
            }

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
            renderSessionSelect();
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

    function renderResumeInfo() {
        resumeInfo.innerHTML = `
            <p><strong>文件名：</strong>${escapeHtml(resume.filename)}</p>
            <p><strong>上传时间：</strong>${new Date(resume.created_at).toLocaleString('zh-CN')}</p>
            ${resume.content_text ? `<p class="resume-preview"><strong>解析预览：</strong>${escapeHtml(resume.content_text)}</p>` : ''}
        `;
    }

    function renderAnalysis() {
        if (analysis) {
            analysisDiv.innerHTML = `<div class="analysis-result">${escapeHtml(analysis).replace(/\n/g, '<br>')}</div>`;
            analyzeBtn.textContent = '重新分析';
        } else {
            analysisDiv.innerHTML = '<p class="empty-state">还没有分析结果，先点击“开始分析”。</p>';
            analyzeBtn.textContent = '开始分析';
        }
    }

    function renderQuestions() {
        if (!questions.length) {
            questionsDiv.innerHTML = '<p class="empty-state">还没有题目，点击“生成题目”即可生成。</p>';
            return;
        }

        questionsDiv.innerHTML = questions.map((question, index) => `
            <div class="question-item">
                <span class="category">${escapeHtml(question.category || '其他')}</span>
                <h4>题目 ${index + 1}</h4>
                <div class="question-text">${escapeHtml(question.question)}</div>
                ${question.answer ? `
                    <div class="answer-section">
                        <button class="btn-toggle-answer" type="button" data-answer-toggle="${index}">显示答案</button>
                        <div class="answer-content hidden" id="answer-${index}">
                            <strong>参考答案</strong>
                            <div class="answer-text">${escapeHtml(question.answer).replace(/\n/g, '<br>')}</div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');

        questionsDiv.querySelectorAll('[data-answer-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const index = button.dataset.answerToggle;
                const answerBlock = document.getElementById(`answer-${index}`);
                const hidden = answerBlock.classList.contains('hidden');
                answerBlock.classList.toggle('hidden', !hidden);
                button.textContent = hidden ? '隐藏答案' : '显示答案';
            });
        });
    }

    function renderSessionSelect() {
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

    function renderVersions() {
        if (!versions.length) {
            optimizationVersions.innerHTML = '<p class="empty-state">还没有优化版本，先生成一版。</p>';
            return;
        }

        optimizationVersions.innerHTML = versions.map((version) => `
            <div class="resume-item">
                <h3>${escapeHtml(version.title)}</h3>
                <p><strong>版本类型：</strong>${escapeHtml(version.version_type)}</p>
                <p><strong>目标岗位：</strong>${escapeHtml(version.target_job_title || '未指定')}</p>
                <p><strong>生成时间：</strong>${new Date(version.created_at).toLocaleString('zh-CN')}</p>
                <p class="resume-preview">${escapeHtml(version.summary || '')}</p>
                <div class="summary-box">${escapeHtml(version.content)}</div>
                ${version.highlights && version.highlights.length ? `
                    <div class="form-hint">优化亮点：${escapeHtml(version.highlights.join('；'))}</div>
                ` : ''}
                <div class="resume-actions">
                    <button type="button" class="btn btn-success" data-export-version="${version.id}" data-format="txt">导出 TXT</button>
                    <button type="button" class="btn btn-secondary" data-export-version="${version.id}" data-format="md">导出 MD</button>
                    <button type="button" class="btn btn-secondary" data-export-version="${version.id}" data-format="docx">导出 DOCX</button>
                    <button type="button" class="btn btn-secondary" data-export-version="${version.id}" data-format="pdf">导出 PDF</button>
                    <button type="button" class="btn btn-danger" data-delete-version="${version.id}">删除版本</button>
                </div>
            </div>
        `).join('');

        optimizationVersions.querySelectorAll('[data-export-version]').forEach((button) => {
            button.addEventListener('click', async () => {
                const versionId = Number(button.dataset.exportVersion);
                const exportFormat = button.dataset.format;
                await exportVersion(versionId, exportFormat);
            });
        });

        optimizationVersions.querySelectorAll('[data-delete-version]').forEach((button) => {
            button.addEventListener('click', async () => {
                const versionId = Number(button.dataset.deleteVersion);
                const confirmed = window.confirm('确认删除这个优化版本吗？');
                if (!confirmed) {
                    return;
                }
                try {
                    await api.deleteResumeOptimization(versionId, user.id);
                    await refreshOptimizationsAndExports();
                } catch (error) {
                    showOptimizationMessage(error.message, true);
                }
            });
        });
    }

    function renderExportRecords() {
        const filtered = records.filter((record) => versions.some((version) => version.id === record.optimization_version_id));
        if (!filtered.length) {
            exportRecords.innerHTML = '<p class="empty-state">还没有导出记录。</p>';
            return;
        }

        exportRecords.innerHTML = filtered.map((record) => `
            <div class="resume-item compact-item">
                <h3>${escapeHtml(record.export_format.toUpperCase())} 导出</h3>
                <p><strong>导出时间：</strong>${new Date(record.created_at).toLocaleString('zh-CN')}</p>
                <p class="resume-preview">${escapeHtml(record.file_path)}</p>
                <div class="resume-actions">
                    <a class="btn btn-primary" href="${api.getExportDownloadUrl(record.id, user.id)}">下载文件</a>
                </div>
            </div>
        `).join('');
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
            if (sessionSelect.value) {
                payload.session_id = Number(sessionSelect.value);
            }
            if (jobMatchSelect.value) {
                payload.job_match_id = Number(jobMatchSelect.value);
            }
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

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            userManager.clearUser();
            window.location.href = '/login.html';
        });
    }

    await loadAll();
});

function translateStatus(status) {
    if (status === 'confirmed') {
        return '已确认';
    }
    if (status === 'completed') {
        return '待确认';
    }
    return '进行中';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
