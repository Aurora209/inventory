"""数据导出与 DataFrame 辅助工具。"""
import pandas as pd
import logging

logger = logging.getLogger(__name__)

def ensure_pandas_compatibility():
    """检查 pandas 版本并记录环境信息。"""
    pandas_version = pd.__version__
    logger.info("当前pandas版本: %s", pandas_version)
    
    # 检查版本并记录环境信息
    major, minor, patch = map(int, pandas_version.split('.'))
    
    if major >= 2 and minor >= 3:
        logger.debug("检测到 pandas 2.3+ 环境")
    
    return True

# 数据导出辅助封装
class PandasExporter:
    """pandas 数据导出辅助封装。"""
    
    @staticmethod
    def to_excel_compatible(df, filepath, **kwargs):
        """导出 Excel 文件。"""
        try:
            # 先使用传入参数导出
            df.to_excel(filepath, **kwargs)
            return True
        except Exception as e:
            logger.warning("Excel 导出失败，尝试备用参数: %s", e)
            try:
                # 使用备用参数重试
                df.to_excel(filepath, index=False, engine='openpyxl')
                return True
            except Exception as e2:
                logger.error("Excel导出完全失败: %s", e2)
                return False
    
    @staticmethod
    def safe_dataframe_creation(data, columns=None):
        """安全创建 DataFrame。"""
        try:
            if columns:
                return pd.DataFrame(data, columns=columns)
            else:
                return pd.DataFrame(data)
        except Exception as e:
            logger.error("DataFrame创建失败: %s", e)
            # 创建空 DataFrame 作为兜底
            return pd.DataFrame()